// Helpers for node labels shared by layout (sizing) and render (drawing), so the
// displayed text and the computed node width stay in sync.

/** Condense a Task resource (and/or invoked function) to a short, readable tag. */
export function shortResource(resource?: string, functionName?: string): string | undefined {
  if (resource) {
    // AWS SDK / optimized integrations: arn:aws:states:::lambda:invoke, etc.
    const integration = resource.match(/^arn:aws:states:::(.+)$/);
    if (integration) {
      return integration[1];
    }
    // Plain ARNs: arn:partition:service:region:account:resource[:name]
    const parts = resource.split(':');
    if (parts[0] === 'arn' && parts.length >= 3) {
      const service = parts[2];
      const last = parts[parts.length - 1];
      return last && last !== service ? `${service}:${last}` : service;
    }
    return resource;
  }
  return functionName;
}

/** The small label above a node's name, e.g. "TASK · lambda:invoke" or "CHOICE". */
export function typeLabel(type: string, resource?: string, functionName?: string): string {
  if (type === 'Task') {
    const short = shortResource(resource, functionName);
    return short ? `TASK · ${short}` : 'TASK';
  }
  return type.toUpperCase();
}
