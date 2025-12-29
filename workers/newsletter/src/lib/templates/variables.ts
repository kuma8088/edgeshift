export interface VariableContext {
  subscriberName: string | null;
  unsubscribeUrl: string;
}

export function replaceVariables(template: string, context: VariableContext): string {
  return template
    .replace(/\{\{subscriber\.name\}\}/g, context.subscriberName ?? '')
    .replace(/\{\{unsubscribe_url\}\}/g, context.unsubscribeUrl);
}
