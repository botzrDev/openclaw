/**
 * MiNA Provider Plugin
 *
 * Registers MiNA (Mixture-of-Experts design engineering team) as an OpenAI-compatible
 * provider inside OpenClaw. MiNA exposes a REST endpoint that speaks the OpenAI
 * Chat Completions protocol, so OpenClaw's existing OpenAI-compatible inference
 * stack drives it without modification.
 *
 * Config written to ~/.openclaw/config.json by the auth wizard:
 *
 *   models.providers.mina:
 *     baseUrl: "http://localhost:8000"   # MiNA REST base URL
 *     api: "openai"                      # use OpenAI-compat wire format
 *     apiKey: "<mina-secret>"            # optional — set "" if none
 *     models:
 *       - id: mina/design-expert         # lead design MoE router
 *       - id: mina/code-expert           # frontend/CSS specialist
 *       - id: mina/ux-researcher         # UX research & critique expert
 *       - id: mina/asset-generator       # image/asset generation expert
 */

import {
  definePluginEntry,
  type OpenClawPluginApi,
  type ProviderAuthContext,
  type ProviderAuthMethodNonInteractiveContext,
  type ProviderAuthResult,
  type ProviderDiscoveryContext,
} from "openclaw/plugin-sdk/core";

const PROVIDER_ID = "mina";
const PROVIDER_LABEL = "MiNA Design Engine";
const DEFAULT_BASE_URL = "http://localhost:8000";
const DEFAULT_API_KEY_ENV_VAR = "MINA_API_KEY";

/** Models MiNA exposes — each maps to a specialist expert in the MoE. */
const MINA_MODELS = [
  {
    id: "mina/design-expert",
    label: "MiNA · Design Expert",
    hint: "Lead design MoE router — orchestrates all specialists",
  },
  {
    id: "mina/code-expert",
    label: "MiNA · Code Expert",
    hint: "Frontend, CSS, component code specialist",
  },
  {
    id: "mina/ux-researcher",
    label: "MiNA · UX Researcher",
    hint: "UX research, accessibility, and design critique",
  },
  {
    id: "mina/asset-generator",
    label: "MiNA · Asset Generator",
    hint: "Image, icon, and visual asset generation",
  },
] as const;

async function loadProviderSetup() {
  return await import("openclaw/plugin-sdk/self-hosted-provider-setup");
}

export default definePluginEntry({
  id: "mina-provider",
  name: "MiNA Provider",
  description: "MiNA autonomous design-engineering MoE as an OpenClaw AI provider",
  register(api: OpenClawPluginApi) {
    api.registerProvider({
      id: PROVIDER_ID,
      label: PROVIDER_LABEL,
      docsPath: "/providers/mina",
      envVars: [DEFAULT_API_KEY_ENV_VAR],

      auth: [
        {
          id: "custom",
          label: PROVIDER_LABEL,
          hint: "MiNA REST endpoint (OpenAI-compatible)",
          kind: "custom",

          run: async (ctx: ProviderAuthContext): Promise<ProviderAuthResult> => {
            const providerSetup = await loadProviderSetup();
            return await providerSetup.promptAndConfigureOpenAICompatibleSelfHostedProviderAuth({
              cfg: ctx.config,
              prompter: ctx.prompter,
              providerId: PROVIDER_ID,
              providerLabel: PROVIDER_LABEL,
              defaultBaseUrl: DEFAULT_BASE_URL,
              defaultApiKeyEnvVar: DEFAULT_API_KEY_ENV_VAR,
              // Show one of the models as the placeholder so the wizard is clear
              modelPlaceholder: "mina/design-expert",
            });
          },

          runNonInteractive: async (ctx: ProviderAuthMethodNonInteractiveContext) => {
            const providerSetup = await loadProviderSetup();
            return await providerSetup.configureOpenAICompatibleSelfHostedProviderNonInteractive({
              ctx,
              providerId: PROVIDER_ID,
              providerLabel: PROVIDER_LABEL,
              defaultBaseUrl: DEFAULT_BASE_URL,
              defaultApiKeyEnvVar: DEFAULT_API_KEY_ENV_VAR,
              modelPlaceholder: "mina/design-expert",
            });
          },
        },
      ],

      discovery: {
        // "late" so MiNA is tried after built-in cloud providers
        order: "late",
        run: async (ctx: ProviderDiscoveryContext) => {
          const explicit = ctx.config.models?.providers?.mina;
          // Resolve the API key from env or config
          const apiKey =
            process.env[DEFAULT_API_KEY_ENV_VAR]?.trim() ||
            ctx.resolveProviderApiKey(PROVIDER_ID).apiKey ||
            explicit?.apiKey ||
            "";

          if (explicit) {
            // User has explicitly configured MiNA — honour it.
            const baseUrl =
              typeof explicit.baseUrl === "string" && explicit.baseUrl.trim()
                ? explicit.baseUrl.trim().replace(/\/$/, "")
                : DEFAULT_BASE_URL;
            return {
              provider: {
                ...explicit,
                baseUrl,
                api: "openai",
                apiKey,
              },
            };
          }

          // Auto-discover: if env var is set, register MiNA with default models.
          if (!apiKey && !process.env[DEFAULT_API_KEY_ENV_VAR]) {
            return null;
          }

          return {
            provider: {
              baseUrl: DEFAULT_BASE_URL,
              api: "openai",
              apiKey,
              models: MINA_MODELS.map((m) => ({ id: m.id, label: m.label })),
            },
          };
        },
      },

      wizard: {
        setup: {
          choiceId: "mina",
          choiceLabel: "MiNA",
          choiceHint: "Autonomous design-engineering MoE",
          groupId: "mina",
          groupLabel: "MiNA",
          groupHint: "Self-hosted MiNA design engine",
          methodId: "custom",
        },
        modelPicker: {
          label: "MiNA (custom)",
          hint: "Enter MiNA endpoint URL and optional API key",
          methodId: "custom",
        },
      },
    });
  },
});
