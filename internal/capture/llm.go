package capture

import "context"

// parseWithProvider is the model path. Manual-only until step 10.
func (p *Parser) parseWithProvider(ctx context.Context, cfg Config, text string, l Lookups) Result {
	return Fallback(text, "model path not built yet")
}
