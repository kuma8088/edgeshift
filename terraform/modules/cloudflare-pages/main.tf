terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = ">= 4.0"
    }
  }
}

# Cloudflare Pages Project
# Note: GitHub integration is handled via GitHub Actions, not Terraform

resource "cloudflare_pages_project" "site" {
  account_id        = var.account_id
  name              = var.project_name
  production_branch = var.production_branch

  build_config {
    build_command   = var.build_command
    destination_dir = var.destination_dir
  }

  deployment_configs {
    production {
      environment_variables = var.environment_variables
    }
    preview {
      environment_variables = var.environment_variables
    }
  }
}

# Custom domain (Phase 2)
resource "cloudflare_pages_domain" "custom" {
  count        = var.custom_domain != null ? 1 : 0
  account_id   = var.account_id
  project_name = cloudflare_pages_project.site.name
  domain       = var.custom_domain
}
