variable "cloudflare_api_token" {
  description = "Cloudflare API Token with Pages permissions"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare Account ID"
  type        = string
}

variable "project_name" {
  description = "Name of the Pages project"
  type        = string
  default     = "edgeshift"
}
