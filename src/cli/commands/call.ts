/**
 * Gateway RPC call command
 */

import { printError, printSuccess, formatOutput } from "../utils/output.js";
import { GatewayRpcClient } from "../utils/rpc-client.js";
import type { RpcCallOptions } from "../types.js";

/** Call RPC method */
export async function callCommand(method: string, args: string[], options: RpcCallOptions): Promise<void> {
  try {
    const client = new GatewayRpcClient(undefined, undefined, options.timeout);

    printSuccess(`Calling RPC: ${method}`);

    // Parse arguments as JSON if possible, otherwise use as strings
    const params: unknown[] = [];
    for (const arg of args) {
      try {
        params.push(JSON.parse(arg));
      } catch {
        params.push(arg);
      }
    }

    const result = await client.call(method, params, options);

    const output = formatOutput(result, options.json ? "json" : "table");
    console.log(output);

    client.close();

  } catch (error) {
    printError(`RPC call failed: ${error}`);
    process.exit(1);
  }
}
