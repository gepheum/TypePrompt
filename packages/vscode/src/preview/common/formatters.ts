import YAML from "yaml";

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat("en-US").format(num);
}

export function formatTimestamp(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function stringifyAsJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function stringifyAsYaml(value: unknown): string {
  return YAML.stringify(value).trimEnd();
}

