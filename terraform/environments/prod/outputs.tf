output "pages_url" {
  description = "URL of the deployed Pages site"
  value       = "https://${module.pages.subdomain}.pages.dev"
}

output "project_name" {
  description = "Name of the Pages project"
  value       = module.pages.project_name
}
