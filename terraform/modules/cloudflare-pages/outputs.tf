output "project_name" {
  description = "Name of the Pages project"
  value       = cloudflare_pages_project.site.name
}

output "subdomain" {
  description = "Default subdomain for the project"
  value       = cloudflare_pages_project.site.subdomain
}

output "domains" {
  description = "List of domains associated with the project"
  value       = cloudflare_pages_project.site.domains
}
