export class TemplateError extends Error {
  code = "template_render_error";

  constructor(message: string) {
    super(message);
    this.name = "TemplateError";
  }
}

export function renderTemplate(template: string, context: Record<string, unknown>): string {
  return renderBlock(template, context);
}

function renderBlock(template: string, context: Record<string, unknown>): string {
  const loopPattern = /{%\s*for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+([A-Za-z0-9_.]+)\s*%}([\s\S]*?){%\s*endfor\s*%}/g;
  let rendered = template;

  while (loopPattern.test(rendered)) {
    rendered = rendered.replace(loopPattern, (_match, itemName, sourcePath, body) => {
      const source = resolvePath(context, sourcePath);
      if (!Array.isArray(source)) {
        throw new TemplateError(`loop source is not iterable: ${sourcePath}`);
      }
      return source
        .map((item) => renderBlock(body, { ...context, [itemName]: item }))
        .join("");
    });
  }

  if (rendered.includes("{%")) {
    throw new TemplateError("unknown template block");
  }

  return rendered.replace(/{{\s*([^}]+?)\s*}}/g, (_match, expression) => {
    const [path, ...filters] = expression.split("|").map((part: string) => part.trim());
    if (filters.length > 0) {
      throw new TemplateError(`unknown filter: ${filters[0]}`);
    }
    return stringifyValue(resolvePath(context, path));
  });
}

function resolvePath(context: Record<string, unknown>, path: string): unknown {
  const segments = path.split(".").filter(Boolean);
  let value: unknown = context;

  for (const segment of segments) {
    if (!isObjectLike(value) || !(segment in value)) {
      throw new TemplateError(`unknown variable: ${path}`);
    }
    value = value[segment];
  }

  return value;
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}
