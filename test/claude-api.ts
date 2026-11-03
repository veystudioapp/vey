import {
  apiEnv,
  apiEnvFor,
  isApiDir,
  setApiEnvs,
  validBaseUrl,
} from "../src/main/claude-api"
import { accountEnv } from "../src/main/claude-profiles"
import { check, finish, section } from "./harness"

/**
 * A custom API profile: the environment a `claude` reaches an
 * Anthropic-compatible endpoint with, which addresses it may be, and that
 * every caller of `accountEnv` gets it by directory alone.
 */

section("the environment")
{
  const env = apiEnv(
    {
      baseUrl: "https://api.z.ai/api/anthropic/",
      model: "glm-4.6",
      fastModel: "",
    },
    "k-1"
  )
  check(
    "the base URL, without its trailing slash",
    env.ANTHROPIC_BASE_URL === "https://api.z.ai/api/anthropic"
  )
  check("the key as a bearer token", env.ANTHROPIC_AUTH_TOKEN === "k-1")
  check(
    "a shell's own API key is blanked, not sent beside it",
    env.ANTHROPIC_API_KEY === ""
  )
  check(
    "the model is what opus and sonnet resolve to",
    env.ANTHROPIC_DEFAULT_OPUS_MODEL === "glm-4.6" &&
      env.ANTHROPIC_DEFAULT_SONNET_MODEL === "glm-4.6" &&
      env.ANTHROPIC_MODEL === "glm-4.6"
  )
  check(
    "and, with no fast model, haiku too",
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL === "glm-4.6"
  )

  const split = apiEnv(
    { baseUrl: "https://x.io", model: "big", fastModel: "small" },
    "k"
  )
  check(
    "a fast model of its own",
    split.ANTHROPIC_DEFAULT_HAIKU_MODEL === "small"
  )

  const bare = apiEnv(
    { baseUrl: "https://x.io", model: "", fastModel: "" },
    "k"
  )
  check(
    "no model leaves the endpoint's own",
    !("ANTHROPIC_MODEL" in bare) && !("ANTHROPIC_DEFAULT_HAIKU_MODEL" in bare)
  )
}

section("the base URL")
{
  check("https", validBaseUrl("https://openrouter.ai/api"))
  check("http to this machine", validBaseUrl("http://localhost:4000"))
  check("not http elsewhere", !validBaseUrl("http://gateway.example.com"))
  check("not a word", !validBaseUrl("openrouter"))
}

section("by directory")
{
  setApiEnvs(
    new Map([
      [
        "/p/glm",
        apiEnv({ baseUrl: "https://x.io", model: "", fastModel: "" }, "k"),
      ],
    ])
  )
  check("held", isApiDir("/p/glm") && !isApiDir("/p/work"))
  check(
    "an ordinary profile has none",
    Object.keys(apiEnvFor("/p/work")).length === 0
  )
  const env = accountEnv("/p/glm")
  check(
    "accountEnv carries the directory and the endpoint",
    env.CLAUDE_CONFIG_DIR === "/p/glm" &&
      env.ANTHROPIC_BASE_URL === "https://x.io"
  )
  check(
    "the default login is nothing",
    Object.keys(accountEnv(null)).length === 0
  )
  setApiEnvs(new Map())
}

finish()
