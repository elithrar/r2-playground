// An example Worker for interacting with Cloudflare R2
//

/// <reference types="@cloudflare/workers-types" />

interface Env {
  GARBAGE: R2Bucket;
}

const JSON_CTYPE = "application/json; charset=utf-8";
const BINARY_CTYPE = "application/octet-stream";
const NUM_WRITES = 5;

async function writeObject(env: any, data: Map<string, Object>): Promise<void> {
  // Generate UUID as our object key.
  let key: string = await crypto.randomUUID();

  try {
    // Generate a simple object as the body.
    let serialized = JSON.stringify(data);

    let obj: R2Object = await env.GARBAGE.put(key, serialized);
    console.log(`wrote key ${obj.key} to bucket: ${obj.size} bytes`);
  } catch (e) {
    let err = `failed to write ${key} to bucket: ${e}`;
    console.log(err);
    throw new Error(err);
  }
}

async function getData(
  req: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  let { pathname } = new URL(req.url);

  // Delete some objects
  try {
    if ((pathname === "/delete")) {
      let list = await env.GARBAGE.list({ limit: 10 });
      let toDelete = [];
      for (const obj of list.objects) {
        toDelete.push(obj.key);
      }

      await env.GARBAGE.delete(toDelete);
      return new Response(JSON.stringify(toDelete, null, 2), {
        status: 200,
        headers: {
          "content-type": JSON_CTYPE,
        },
      });
    }
  } catch (e) {
    let err = `failed to delete: ${e}`;
    console.log(err);
    return new Response(err, { status: 500 });
  }


  // Fetch a specific object
  try {
    if (pathname !== "/" || pathname.startsWith("/favicon.ico")) {
      let key = pathname.slice(1).trim();
      console.log(`fetching object ${key}`);
      let obj = await env.GARBAGE.get(key);

      if (obj === null) {
        return new Response(`key ${key} not found`, {
          status: 404,
        });
      }

      return new Response(obj.body, {
        status: 200,
        headers: {
          "content-type": obj.httpMetadata.contentType ?? BINARY_CTYPE,
        },
      });
    }
  } catch (e) {
    let err = `failed to get object: ${e}`;
    console.log(err);
    return new Response(err, { status: 500 });
  }

  try {
    let data = new Map<string, Object>();
    data.set("timestamp", Date.now());
    data.set("url", req.url);
    data.set("requestCountry", req.cf?.country ?? "");
    data.set("requestAsn", req.cf?.asn || "");

    for (let i = 0; i < NUM_WRITES; i++) {
      data.set("num", i);
      await writeObject(env, data);
    }
  } catch (e) {
    let err = `failed to write object: ${e}`;
    console.log(err);
    return new Response(err, { status: 500 });
  }

  // List all objects
  try {
    let list = await env.GARBAGE.list({ limit: 1000 });

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
