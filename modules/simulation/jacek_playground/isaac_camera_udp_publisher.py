"""
Isaac Sim UDP Camera Publisher
Pobiera obrazy z kamer CCTV w Isaac Sim i wysyła przez UDP do ROS2 bridge
"""

import socket
import struct
import numpy as np
import pickle
import time


class CameraUDPPublisher:
    def __init__(self, host='127.0.0.1', port=9870):
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.host = host
        self.port = port
        self.max_packet_size = 65507
        
    def publish_image(self, camera_id: int, image_data: np.ndarray, timestamp: float):
        """
        Publikuj obraz z kamery przez UDP
        
        Args:
            camera_id: ID kamery (0, 1, 2)
            image_data: numpy array (H, W, 3) w formacie RGB uint8
            timestamp: timestamp symulacji
        """
        height, width, channels = image_data.shape
        
        msg = {
            'type': 'image',
            'camera_id': camera_id,
            'timestamp': timestamp,
            'width': width,
            'height': height,
            'encoding': 'rgb8',
            'data': image_data.tobytes()
        }
        
        serialized = pickle.dumps(msg, protocol=pickle.HIGHEST_PROTOCOL)
        
        if len(serialized) > self.max_packet_size:
            compressed_data = self._compress_image(image_data)
            msg['data'] = compressed_data
            msg['compressed'] = True
            serialized = pickle.dumps(msg, protocol=pickle.HIGHEST_PROTOCOL)
        
        self._send_chunked(serialized)
    
    def publish_camera_info(self, camera_id: int, width: int, height: int, 
                           fx: float, fy: float, cx: float, cy: float, timestamp: float):
        """
        Publikuj camera_info przez UDP
        
        Args:
            camera_id: ID kamery (0, 1, 2)
            width, height: rozdzielczość
            fx, fy: focal length
            cx, cy: principal point
            timestamp: timestamp symulacji
        """
        msg = {
            'type': 'camera_info',
            'camera_id': camera_id,
            'timestamp': timestamp,
            'width': width,
            'height': height,
            'K': [fx, 0.0, cx, 0.0, fy, cy, 0.0, 0.0, 1.0],
            'D': [0.0, 0.0, 0.0, 0.0, 0.0],
            'R': [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
            'P': [fx, 0.0, cx, 0.0, 0.0, fy, cy, 0.0, 0.0, 0.0, 1.0, 0.0]
        }
        
        serialized = pickle.dumps(msg, protocol=pickle.HIGHEST_PROTOCOL)
        self._send_chunked(serialized)
    
    def _compress_image(self, image_data: np.ndarray) -> bytes:
        """Kompresuj obraz JPEG dla zmniejszenia rozmiaru"""
        import cv2
        _, encoded = cv2.imencode('.jpg', cv2.cvtColor(image_data, cv2.COLOR_RGB2BGR), 
                                  [cv2.IMWRITE_JPEG_QUALITY, 85])
        return encoded.tobytes()
    
    def _send_chunked(self, data: bytes):
        """Wyślij dane w chunkach jeśli są za duże"""
        chunk_size = self.max_packet_size - 100
        total_chunks = (len(data) + chunk_size - 1) // chunk_size
        
        msg_id = int(time.time() * 1000000) % 1000000
        
        for i in range(total_chunks):
            start = i * chunk_size
            end = min(start + chunk_size, len(data))
            chunk = data[start:end]
            
            header = struct.pack('!III', msg_id, i, total_chunks)
            packet = header + chunk
            
            self.sock.sendto(packet, (self.host, self.port))
    
    def close(self):
        self.sock.close()
