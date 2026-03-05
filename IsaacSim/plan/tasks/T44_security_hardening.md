# T44_security_hardening

Status: TODO
Depends on: T11_infra_deploy
Outputs: KMS keys, secrets management, VPC Flow Logs configured.

## Purpose

Enhance security posture by adding encryption key management, secrets management, and audit logging.

## Steps

1. Create KMS Customer Managed Key (CMK) for S3/EFS encryption.
2. Update S3 bucket to use KMS encryption.
3. Update EFS to use KMS encryption.
4. Create Secrets Manager secret for DCV user passwords.
5. Enable VPC Flow Logs to CloudWatch.
6. Set CloudWatch Logs retention policy.

## CloudFormation Additions

Add these resources to `cfn/infra.yaml`:

```yaml
# KMS Customer Managed Key
KmsKey:
  Type: AWS::KMS::Key
  Properties:
    Description: !Sub "${ProjectName} encryption key"
    EnableKeyRotation: true
    KeyPolicy:
      Version: '2012-10-17'
      Statement:
        - Sid: Enable IAM User Permissions
          Effect: Allow
          Principal:
            AWS: !Sub 'arn:aws:iam::${AWS::AccountId}:root'
          Action: 'kms:*'
          Resource: '*'
        - Sid: Allow EC2 Instances
          Effect: Allow
          Principal:
            AWS: !GetAtt Ec2Role.Arn
          Action:
            - 'kms:Decrypt'
            - 'kms:GenerateDataKey*'
            - 'kms:DescribeKey'
          Resource: '*'
    Tags:
      - Key: Name
        Value: !Sub "${ProjectName}-kms-key"

KmsKeyAlias:
  Type: AWS::KMS::Alias
  Properties:
    AliasName: !Sub "alias/${ProjectName}"
    TargetKeyId: !Ref KmsKey

# Secrets Manager for DCV passwords
DcvPasswordsSecret:
  Type: AWS::SecretsManager::Secret
  Properties:
    Name: !Sub "${ProjectName}/dcv-passwords"
    Description: DCV user passwords for Isaac Sim workstation
    GenerateSecretString:
      SecretStringTemplate: '{"workstation": ""}'
      GenerateStringKey: "workstation"
      PasswordLength: 16
      ExcludeCharacters: '"@/\\'
    KmsKeyId: !Ref KmsKey
    Tags:
      - Key: Name
        Value: !Sub "${ProjectName}-dcv-passwords"

# VPC Flow Logs
FlowLogsLogGroup:
  Type: AWS::Logs::LogGroup
  Properties:
    LogGroupName: !Sub "/aws/vpc/${ProjectName}-flow-logs"
    RetentionInDays: 90
    KmsKeyId: !GetAtt KmsKey.Arn

FlowLogsRole:
  Type: AWS::IAM::Role
  Properties:
    RoleName: !Sub "${ProjectName}-flow-logs-role"
    AssumeRolePolicyDocument:
      Version: '2012-10-17'
      Statement:
        - Effect: Allow
          Principal:
            Service: vpc-flow-logs.amazonaws.com
          Action: 'sts:AssumeRole'
    Policies:
      - PolicyName: FlowLogsPolicy
        PolicyDocument:
          Version: '2012-10-17'
          Statement:
            - Effect: Allow
              Action:
                - 'logs:CreateLogStream'
                - 'logs:PutLogEvents'
                - 'logs:DescribeLogGroups'
                - 'logs:DescribeLogStreams'
              Resource: !GetAtt FlowLogsLogGroup.Arn

VpcFlowLog:
  Type: AWS::EC2::FlowLog
  Properties:
    DeliverLogsPermissionArn: !GetAtt FlowLogsRole.Arn
    LogGroupName: !Ref FlowLogsLogGroup
    ResourceId: !Ref Vpc
    ResourceType: VPC
    TrafficType: ALL
    Tags:
      - Key: Name
        Value: !Sub "${ProjectName}-vpc-flow-log"
```

## Update Existing Resources

### Update S3 Bucket Encryption

```yaml
ArtifactsBucket:
  Type: AWS::S3::Bucket
  Properties:
    BucketName: !Sub "${ProjectName}-${AWS::AccountId}-${AWS::Region}-artifacts"
    VersioningConfiguration:
      Status: Enabled
    BucketEncryption:
      ServerSideEncryptionConfiguration:
        - ServerSideEncryptionByDefault:
            SSEAlgorithm: aws:kms
            KMSMasterKeyID: !Ref KmsKey
          BucketKeyEnabled: true
```

### Update EFS Encryption

```yaml
SharedEfs:
  Type: AWS::EFS::FileSystem
  Properties:
    Encrypted: true
    KmsKeyId: !GetAtt KmsKey.Arn
    PerformanceMode: generalPurpose
    ThroughputMode: elastic
    FileSystemTags:
      - Key: Name
        Value: !Sub "${ProjectName}-efs"
```

### Update EC2 Role for Secrets Access

Add to `Ec2Role` policies:

```yaml
- PolicyName: !Sub "${ProjectName}-secrets-access"
  PolicyDocument:
    Version: '2012-10-17'
    Statement:
      - Effect: Allow
        Action:
          - 'secretsmanager:GetSecretValue'
        Resource: !Ref DcvPasswordsSecret
```

## Add Outputs

```yaml
KmsKeyId:
  Value: !Ref KmsKey
  Export:
    Name: !Sub "${ProjectName}-kms-key-id"

KmsKeyArn:
  Value: !GetAtt KmsKey.Arn
  Export:
    Name: !Sub "${ProjectName}-kms-key-arn"

DcvPasswordsSecretArn:
  Value: !Ref DcvPasswordsSecret
  Export:
    Name: !Sub "${ProjectName}-dcv-passwords-secret"

FlowLogsLogGroupName:
  Value: !Ref FlowLogsLogGroup
```

## Usage: Retrieve DCV Password

From bootstrap scripts:

```bash
# Retrieve DCV workstation password from Secrets Manager
DCV_PASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id "${PROJECT}/dcv-passwords" \
  --query 'SecretString' --output text | jq -r '.workstation')

# Set password for workstation user
echo "workstation:${DCV_PASSWORD}" | sudo chpasswd
```

## Acceptance

- [ ] KMS key exists with rotation enabled.
- [ ] S3 bucket uses KMS encryption (verify with `aws s3api get-bucket-encryption`).
- [ ] EFS uses KMS encryption (verify with `aws efs describe-file-systems`).
- [ ] Secrets Manager contains DCV passwords secret.
- [ ] VPC Flow Logs are enabled and writing to CloudWatch.
- [ ] CloudWatch Logs retention is set to 90 days.

## Validation Commands

```bash
# Verify KMS key
aws kms describe-key --key-id alias/${PROJECT}

# Verify S3 encryption
aws s3api get-bucket-encryption --bucket ${ARTIFACTS_BUCKET}

# Verify EFS encryption
aws efs describe-file-systems --file-system-id ${EFS_FS_ID} \
  --query 'FileSystems[0].{Encrypted:Encrypted,KmsKeyId:KmsKeyId}'

# Verify Secrets Manager
aws secretsmanager describe-secret --secret-id ${PROJECT}/dcv-passwords

# Verify VPC Flow Logs
aws ec2 describe-flow-logs --filter Name=resource-id,Values=${VPC_ID}

# Verify CloudWatch Logs retention
aws logs describe-log-groups \
  --log-group-name-prefix /aws/vpc/${PROJECT} \
  --query 'logGroups[0].retentionInDays'
```

## Rollback

- Delete KMS key (scheduled deletion, 7-30 day waiting period).
- Delete Secrets Manager secret (immediate or scheduled).
- Delete VPC Flow Log.
- Delete CloudWatch Log Group.
- Revert S3/EFS to default encryption.
