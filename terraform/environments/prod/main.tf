terraform {
  required_version = ">= 1.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }

  # Local backend for now
  # TODO: Migrate to Cloudflare R2 or S3 for team collaboration
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

module "pages" {
  source = "../../modules/cloudflare-pages"

  account_id   = var.cloudflare_account_id
  project_name = var.project_name

  build_command   = "npm run build"
  destination_dir = "dist"

  environment_variables = {
    NODE_VERSION = "20"
  }

  # Phase 2: Uncomment when domain is purchased
  # custom_domain = "edgeshift.dev"
}
