import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { HTTPException } from 'hono/http-exception'

export interface HonoContext {
  Bindings: {
    ENVIRONMENT: string
  }
}

const app = new Hono<HonoContext>()
app.use('*', logger())
app.use(prettyJSON())

app.get('/view-source', (ctx) => {
  return ctx.redirect('https://github.com/luxass/assets', 301)
})

app.get(
  '/api/font/*',
  async (ctx, next) => {
    if (ctx.env.ENVIRONMENT !== 'production' && ctx.env.ENVIRONMENT !== 'staging') {
      return await next()
    }
    const key = ctx.req.url
    const cache = await caches.open('fonts')

    const response = await cache.match(key)
    if (!response) {
      // eslint-disable-next-line no-console
      console.info('serving font from network')
      await next()
      if (!ctx.res.ok) {
        console.error('failed to fetch font, skipping caching')
        return
      }

      ctx.res.headers.set('Cache-Control', 'public, max-age=3600')

      const response = ctx.res.clone()
      ctx.executionCtx.waitUntil(cache.put(key, response))
    } else {
      // eslint-disable-next-line no-console
      console.info('serving font from cache')
      return new Response(response.body, response)
    }
  },
)

app.get('api/font/:family/:weight/:text?', async (ctx) => {
  const url = new URL(ctx.req.url)
  const { family: _family, weight, text } = ctx.req.param()

  const family = _family[0].toUpperCase() + _family.slice(1)

  let fontsUrl = `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}`
  if (text) {
    // allow font optimization if we pass text => only getting the characters we need
    fontsUrl += `&text=${encodeURIComponent(text)}`
  }

  const css = await (
    await fetch(fontsUrl, {
      headers: {
        // Make sure it returns TTF.
        'User-Agent':
          'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1',
      },
    })
  ).text()

  const resource = css.match(
    /src: url\((.+)\) format\('(opentype|truetype)'\)/,
  )

  if (!resource || !resource[1]) {
    return new Response('No resource found', { status: 404 })
  }

  const res = await fetch(resource[1])

  const arrayBuffer = await res.arrayBuffer()
  const body = new Uint8Array(arrayBuffer)

  const response = new Response(body, res)

  if (url.hostname === 'localhost') {
    response.headers.delete('content-encoding')
    response.headers.delete('content-length')
  }

  return response
})

app.use(async (ctx) => {
  const url = new URL(ctx.req.url)
  const { pathname } = url

  if (url.pathname === "/") {
    url.pathname = "/README.md";
  }
  const branch = url.searchParams.get("branch") || "main";
  return fetch(`https://raw.githubusercontent.com/luxass/assets/${branch}/${url.pathname}`);
})

app.onError(async (err, ctx) => {
  console.error(err)
  if (err instanceof HTTPException) {
    return err.getResponse()
  }

  const message = ctx.env.ENVIRONMENT === 'production' ? 'Internal server error' : err.stack
  console.error(err)
  return new Response(message, {
    status: 500,
  })
})

app.notFound(async () => {
  return new Response('Not found', {
    status: 404,
  })
})

export default app
