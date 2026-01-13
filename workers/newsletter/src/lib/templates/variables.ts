export interface VariableContext {
  subscriberName: string | null;
  unsubscribeUrl: string;
}

export function replaceVariables(template: string, context: VariableContext): string {
  const name = context.subscriberName ?? '';

  return template
    // Primary variable: {{name}} - for explicit name display in content
    .replace(/\{\{name\}\}/g, name)
    // Legacy support: {{subscriber.name}}
    .replace(/\{\{subscriber\.name\}\}/g, name)
    .replace(/\{\{unsubscribe_url\}\}/g, context.unsubscribeUrl);
}
