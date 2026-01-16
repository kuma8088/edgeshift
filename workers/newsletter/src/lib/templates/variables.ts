export interface VariableContext {
  subscriberName: string | null;
  unsubscribeUrl: string;
}

export function replaceVariables(template: string, context: VariableContext): string {
  const name = context.subscriberName ?? '';

  // Wrap unsubscribe URL in anchor tag when used in content
  // This ensures proper link rendering after Resend expands {{{RESEND_UNSUBSCRIBE_URL}}}
  const unsubscribeLink = `<a href="${context.unsubscribeUrl}" style="color: #666666;">配信停止</a>`;

  return template
    // Primary variable: {{name}} - for explicit name display in content
    .replace(/\{\{name\}\}/g, name)
    // Legacy support: {{subscriber.name}}
    .replace(/\{\{subscriber\.name\}\}/g, name)
    .replace(/\{\{unsubscribe_url\}\}/g, unsubscribeLink);
}
