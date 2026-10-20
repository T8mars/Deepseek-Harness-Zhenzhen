# 0006 · Published chat adapter wire contract

Date: 2026-10-20. Status: local protocol contract verified; live chat remains open.

C12 now mounts the real published LlmRuntime and llm-pi-ai plugin over a
synthetic loopback HTTP/SSE server. Credentials are provided through the public
credentials seam; no ambient API key or real endpoint is used. The tests cover
the exact prefixed default model, output limit, text/usage streaming, fragmented
tool arguments, a real ToolRuntime result round trip, credential removal,
HTTP errors, cancellation, idle timeout and truncated tool calls.

The first run exposed a concrete configuration mismatch: generic pi-ai detection
sends max_completion_tokens for this custom provider, while the Seedance chat
documentation uses max_tokens. The bundle now sets public compat.maxTokensField
to max_tokens. No adapter wire code or upstream file changed.

The pinned adapter maps a synthetic 402 to PI_AI_ERROR and drops structured
HTTP status. This is an open compatibility limitation, not a successful
insufficient-balance implementation. More advanced model capabilities are not
enabled based on loopback results. See seedance-compat.md for evidence and scope.
