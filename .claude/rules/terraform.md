---
paths:
  - "**/*.tf"
  - "**/*.tfvars"
  - "infrastructure/**/*"
  - "terraform/**/*"
---

# Terraform / IaC コーディング規約

---

## 変数定義

```hcl
# Good: description, type, validation を設定
variable "environment" {
  description = "デプロイ環境（dev, stg, prod）"
  type        = string

  validation {
    condition     = contains(["dev", "stg", "prod"], var.environment)
    error_message = "environment は dev, stg, prod のいずれかを指定してください"
  }
}

variable "instance_count" {
  description = "EC2 インスタンス数"
  type        = number
  default     = 1

  validation {
    condition     = var.instance_count >= 1 && var.instance_count <= 10
    error_message = "instance_count は 1〜10 の範囲で指定してください"
  }
}

# Bad: 説明・型・バリデーションがない
variable "environment" {}
```

---

## リソースタグ

```hcl
# Good: 共通タグを locals で定義
locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
    Owner       = var.owner_email
  }
}

resource "aws_instance" "web" {
  ami           = var.ami_id
  instance_type = var.instance_type

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-web-${var.environment}"
    Role = "web-server"
  })
}

# Bad: タグなし、または一貫性がない
resource "aws_instance" "web" {
  ami           = var.ami_id
  instance_type = var.instance_type
  # タグがない
}
```

---

## 命名規則

```hcl
# リソース名: snake_case
resource "aws_security_group" "web_server" { ... }
resource "aws_iam_role" "lambda_execution" { ... }

# 変数名: snake_case
variable "vpc_cidr_block" { ... }
variable "enable_nat_gateway" { ... }

# ローカル変数: snake_case
locals {
  subnet_count = length(var.availability_zones)
}

# 出力: snake_case
output "vpc_id" {
  value = aws_vpc.main.id
}
```

---

## モジュール構成

```
infrastructure/
├── environments/
│   ├── dev/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── terraform.tfvars
│   ├── stg/
│   └── prod/
├── modules/
│   ├── vpc/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── ecs/
│   └── rds/
└── README.md
```

---

## State 管理

```hcl
# Good: リモート state（S3 + DynamoDB）
terraform {
  backend "s3" {
    bucket         = "my-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "ap-northeast-1"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
  }
}

# Bad: ローカル state（チーム開発に不向き）
# backend の設定なし
```

---

## セキュリティグループ

```hcl
# Good: 最小限のポート開放、CIDR を明示
resource "aws_security_group" "web" {
  name        = "${var.project_name}-web-sg"
  description = "Security group for web servers"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTPS from internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

# Bad: 全ポート開放
ingress {
  from_port   = 0
  to_port     = 65535
  protocol    = "tcp"
  cidr_blocks = ["0.0.0.0/0"]  # 危険
}
```

---

## 機密情報の管理

```hcl
# Good: Secrets Manager / Parameter Store を使用
data "aws_secretsmanager_secret_version" "db_password" {
  secret_id = "prod/database/password"
}

resource "aws_db_instance" "main" {
  password = data.aws_secretsmanager_secret_version.db_password.secret_string
  # ...
}

# Bad: 平文でパスワードを記述
resource "aws_db_instance" "main" {
  password = "my-super-secret-password"  # 絶対NG
}
```

---

## 禁止パターン

```hcl
# ハードコードされた AMI ID
ami = "ami-0123456789abcdef0"  # Bad: リージョン依存、更新が困難

# count と for_each の混在（同一リソースで）
# どちらか一方に統一する

# depends_on の乱用
# 暗黙的な依存関係で解決できる場合は使用しない
```
