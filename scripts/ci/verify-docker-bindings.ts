type PortBinding = { HostIp?: string; HostPort?: string };
type PortMap = Record<string, PortBinding[] | null>;

const expectedBindings: Record<
  string,
  { container: string; host: string } | null
> = {
  "auth": null,
  "auth-migration": null,
  "edge-runtime": null,
  "kong": { container: "8000/tcp", host: "54321" },
  "mailpit": { container: "8025/tcp", host: "54324" },
  "postgres": { container: "5432/tcp", host: "54322" },
  "rest": null,
};

const parseMap = (value: string, source: string): PortMap => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${source} is not valid JSON`);
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error(`${source} is not a port map`);
  }
  return parsed as PortMap;
};

const published = (map: PortMap, source: string) => {
  const result: Array<{ container: string; hostIp: string; hostPort: string }> =
    [];
  for (const [container, bindings] of Object.entries(map)) {
    if (bindings === null) continue;
    if (!Array.isArray(bindings)) {
      throw new Error(`${source} binding is malformed`);
    }
    for (const binding of bindings) {
      if (!binding || typeof binding !== "object") {
        throw new Error(`${source} binding is malformed`);
      }
      const hostIp = binding.HostIp ?? "";
      const hostPort = binding.HostPort ?? "";
      if (hostIp !== "127.0.0.1") throw new Error(`${source} host IP rejected`);
      if (!["54321", "54322", "54324"].includes(hostPort)) {
        throw new Error(`${source} host port rejected`);
      }
      result.push({ container, hostIp, hostPort });
    }
  }
  return result.sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b))
  );
};

export const verifyDockerBindings = (
  service: string,
  hostConfigJson: string,
  networkSettingsJson: string,
  networksJson = '{"bloodconnectindia-disposable-loopback":{}}',
) => {
  if (!(service in expectedBindings)) {
    throw new Error("Compose service rejected");
  }
  const hostConfig = published(
    parseMap(hostConfigJson, "HostConfig.PortBindings"),
    "HostConfig.PortBindings",
  );
  const networkSettings = published(
    parseMap(networkSettingsJson, "NetworkSettings.Ports"),
    "NetworkSettings.Ports",
  );
  if (JSON.stringify(hostConfig) !== JSON.stringify(networkSettings)) {
    throw new Error("Docker binding structures disagree");
  }
  const networks = parseMap(networksJson, "NetworkSettings.Networks");
  if (
    JSON.stringify(Object.keys(networks).sort()) !==
      JSON.stringify(["bloodconnectindia-disposable-loopback"])
  ) throw new Error("Dedicated network membership rejected");
  const expected = expectedBindings[service];
  if (expected === null) {
    if (hostConfig.length !== 0) {
      throw new Error("Internal-only service is published");
    }
    return;
  }
  if (
    hostConfig.length !== 1 ||
    hostConfig[0].container !== expected.container ||
    hostConfig[0].hostPort !== expected.host ||
    hostConfig[0].hostIp !== "127.0.0.1"
  ) throw new Error("Published binding does not match approved topology");
};

if (import.meta.main) {
  if (Deno.args.length !== 4) {
    throw new Error("Binding verifier arguments rejected");
  }
  verifyDockerBindings(Deno.args[0], Deno.args[1], Deno.args[2], Deno.args[3]);
}
