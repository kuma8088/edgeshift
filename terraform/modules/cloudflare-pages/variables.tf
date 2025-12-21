variable "account_id" {
  description = "Cloudflare Account ID"
  type        = string
}

variable "project_name" {
  description = "Name of the Pages project"
  type        = string
}

variable "production_branch" {
  description = "Git branch for production deployments"
  type        = string
  default     = "main"
}

variable "build_command" {
  description = "Build command for the project"
  type        = string
  default     = "npm run build"
}

variable "destination_dir" {
  description = "Output directory for built files"
  type        = string
  default     = "dist"
}

variable "environment_variables" {
  description = "Environment variables for deployments"
  type        = map(string)
  default = {
    NODE_VERSION = "20"
  }
}

variable "custom_domain" {
  description = "Custom domain for the Pages project (optional)"
  type        = string
  default     = null
}
