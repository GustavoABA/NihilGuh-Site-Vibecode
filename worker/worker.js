let tokenCache = {
  accessToken: null,
  expiresAt: 0
};

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = String(env.ALLOWED_ORIGIN || "https://gustavoaba.github.io");
  const permit = origin === allowed || origin === "http://localhost:8000" || origin === "http://127.0.0.1:8000";
  return {
    "Access-Control-Allow-Origin": permit ? origin : allowed,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function reply(request, env, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(request, env) }
  });
}

async function getAccessToken(env) {
  const now = Date.now();
  if (tokenCache.accessToken && now < tokenCache.expiresAt - 60_000) {
    return tokenCache.accessToken;
  }

  if (!env.LIVEPIX_CLIENT_ID || !env.LIVEPIX_CLIENT_SECRET) {
    throw new Error("Credenciais LivePix não configuradas no Worker.");
  }

  const form = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env.LIVEPIX_CLIENT_ID,
    client_secret: env.LIVEPIX_CLIENT_SECRET
  });

  if (env.LIVEPIX_SCOPE) form.set("scope", env.LIVEPIX_SCOPE);

  const response = await fetch("https://oauth.livepix.gg/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Falha ao autenticar no LivePix.");
  }

  tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + (Number(data.expires_in || 3600) * 1000)
  };

  return tokenCache.accessToken;
}

async function livePix(env, path, init = {}) {
  const accessToken = await getAccessToken(env);

  const response = await fetch(`https://api.livepix.gg${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });

  if (response.status === 204) return null;

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error_description ||
      data?.error ||
      `LivePix retornou HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

function requireAmount(value) {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount < 100 || amount > 5_000_000) {
    throw new Error("Informe um valor entre R$ 1,00 e R$ 50.000,00.");
  }
  return amount;
}

function cleanText(value, max, required = true) {
  const text = String(value ?? "").trim();
  if (required && !text) throw new Error("Preencha todos os campos obrigatórios.");
  if (text.length > max) throw new Error(`Campo excede ${max} caracteres.`);
  return text;
}

function safeRedirect(value, env) {
  const fallback = String(env.SITE_URL || "https://gustavoaba.github.io/NihilGuh-Site-Vibecode/");
  try {
    const candidate = new URL(String(value || fallback));
    const site = new URL(fallback);
    if (candidate.origin !== site.origin) return fallback;
    return candidate.href;
  } catch {
    return fallback;
  }
}

async function parseBody(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 16_000) throw new Error("Requisição muito grande.");
  return request.json();
}

async function handleMessage(request, env) {
  const body = await parseBody(request);
  const payload = {
    username: cleanText(body.username, 60),
    message: cleanText(body.message, 500),
    amount: requireAmount(body.amount),
    currency: "BRL",
    redirectUrl: safeRedirect(body.redirectUrl, env)
  };
  const result = await livePix(env, "/v2/messages", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return {
    reference: result?.data?.reference,
    redirectUrl: result?.data?.redirectUrl
  };
}

async function handlePayment(request, env) {
  const body = await parseBody(request);
  const payload = {
    amount: requireAmount(body.amount),
    currency: "BRL",
    redirectUrl: safeRedirect(body.redirectUrl, env)
  };
  const result = await livePix(env, "/v2/payments", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return {
    reference: result?.data?.reference,
    redirectUrl: result?.data?.redirectUrl
  };
}

async function handlePlans(env) {
  const result = await livePix(env, "/v2/subscriptions/plans?limit=50&page=1", {
    method: "GET"
  });

  const plans = Array.isArray(result?.data) ? result.data : [];
  return {
    data: plans.map((plan) => ({
      id: plan.id,
      slug: plan.slug,
      name: plan.name,
      description: plan.description,
      amount: plan.amount,
      currency: plan.currency
    }))
  };
}

async function handleSubscription(request, env) {
  const body = await parseBody(request);
  const allowedRecurrence = new Set(["monthly", "quarterly", "semiannual", "yearly"]);
  const recurrence = String(body.recurrence || "monthly");
  if (!allowedRecurrence.has(recurrence)) throw new Error("Recorrência inválida.");

  const payload = {
    planId: cleanText(body.planId, 100),
    recurrence,
    subscriber: {
      username: cleanText(body?.subscriber?.username, 60),
      email: cleanText(body?.subscriber?.email, 160)
    },
    redirectUrl: safeRedirect(body.redirectUrl, env)
  };

  const result = await livePix(env, "/v2/subscriptions", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  return {
    reference: result?.data?.reference,
    redirectUrl: result?.data?.redirectUrl
  };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === "/health" && request.method === "GET") {
        await getAccessToken(env);
        return reply(request, env, { ok: true });
      }

      if (url.pathname === "/message" && request.method === "POST") {
        return reply(request, env, await handleMessage(request, env), 201);
      }

      if (url.pathname === "/payment" && request.method === "POST") {
        return reply(request, env, await handlePayment(request, env), 201);
      }

      if (url.pathname === "/plans" && request.method === "GET") {
        return reply(request, env, await handlePlans(env));
      }

      if (url.pathname === "/subscription" && request.method === "POST") {
        return reply(request, env, await handleSubscription(request, env), 201);
      }

      return reply(request, env, { error: "Rota não encontrada." }, 404);
    } catch (error) {
      const status = Number(error.status) >= 400 && Number(error.status) < 600 ? Number(error.status) : 400;
      return reply(request, env, { error: error.message || "Erro inesperado." }, status);
    }
  }
};
