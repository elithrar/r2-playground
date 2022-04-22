// An example Worker for interacting with Cloudflare R2
//

/// <reference types="@cloudflare/workers-types" />

const JSON_CTYPE = "application/json; charset=utf-8";
const BINARY_CTYPE = "application/octet-stream";

async function writeObject(env: any, timestamp: number): Promise<void> {
  let key: string = await crypto.randomUUID();
  let data: string = JSON.stringify({ ts: timestamp });

  try {
    await env.GARBAGE.put(key, data);
    console.log(`wrote key ${key} to bucket`);
  } catch (e) {
    let err = `failed to write ${key} to bucket: ${e}`;
    console.log(err);
    throw new Error(err);
  }
}

async function getData(
  req: Request,
  env: any,
  ctx: ExecutionContext
): Promise<Response> {
  let { pathname } = new URL(req.url);

  // Fetch a specific object
  try {
    if (pathname !== "/" || pathname.startsWith("/favicon.ico")) {
      let key = pathname.slice(1).trim();
      console.log(`fetching object ${key}`);
      let obj: R2ObjectBody = await env.GARBAGE.get(key);

      if (obj === null) {
        return new Response(`key ${key} not found`, {
          status: 404,
        });
      }

      return new Response(obj.body, {
        status: 200,
        headers: {
          "content-type": obj.httpMetadata.contentType ?? BINARY_CTYPE
        },
      });
    }
  } catch (e) {
    let err = `failed to get object: ${e}`;
    console.log(err);
    return new Response(err, { status: 500 });
  }

  // List all objects
  try {
    let timestamp = Date.now();
    await writeObject(env, timestamp);
    let list = await env.GARBAGE.list();

    return new Response(JSON.stringify(list, null, 2), {
      status: 200,
      headers: {
        "content-type": JSON_CTYPE,
      },
    });
  } catch (e) {
    let err = `failed to get list: ${e}`;
    console.log(err);
    return new Response(err, { status: 500 });
  }
}

const worker = {
  async scheduled(
    controller: ScheduledController,
    env: any,
    ctx: ExecutionContext
  ) {
    console.log(`cron processed at: ${controller.scheduledTime}`);
    let ts = controller.scheduledTime ?? Date.now();
    ctx.waitUntil(writeObject(env, ts));
  },

  async fetch(req: Request, env: any, ctx: ExecutionContext) {
    return getData(req, env, ctx);
  },
};

export default worker;
