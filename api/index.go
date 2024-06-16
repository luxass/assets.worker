package handler

import (
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"github.com/labstack/echo/v4"
)

func Handler(w http.ResponseWriter, r *http.Request) {
	e := echo.New()

	e.GET("/favicon.ico", FaviconProxy)
	e.GET("/view-source", ViewSource)

	e.GET("/api/font/:family/:weight", FontHandler)
	e.GET("/api/font/:family/:weight/:text", FontHandlerWithText)

	e.GET("/*", ContentProxy)

	e.ServeHTTP(w, r)
}

func ViewSource(c echo.Context) error {
	return c.Redirect(http.StatusMovedPermanently, "https://github.com/luxass/assets")
}

func ContentProxy(c echo.Context) error {
	url := c.Request().URL

	if url.Path == "/" {
		url.Path = "/README.md"
	}

	branch := url.Query().Get("branch")
	if branch == "" {
		branch = "main"
	}

	rawURL := "https://raw.githubusercontent.com/luxass/assets/" + branch + url.Path

	resp, err := http.Get(rawURL)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	return ProxyResponse(c, resp)
}

func FaviconProxy(c echo.Context) error {
	rawURL := "https://image.luxass.dev/api/image/emoji"

	resp, err := http.Get(rawURL)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	return ProxyResponse(c, resp)
}

func ProxyResponse(c echo.Context, resp *http.Response) error {
	c.Response().Header().Set("Content-Type", resp.Header.Get("Content-Type"))

	// set cache control headers
	c.Response().Header().Set("Cache-Control", "public, max-age=3600")

	_, err := io.Copy(c.Response(), resp.Body)
	return err
}

func FontHandler(c echo.Context) error {
	family := c.Param("family")
	weight := c.Param("weight")

	return FontHandlerInternal(c, FontHandlerOptions{
		Family: family,
		Weight: weight,
	})
}

func FontHandlerWithText(c echo.Context) error {
	family := c.Param("family")
	weight := c.Param("weight")
	text := c.Param("text")

	return FontHandlerInternal(c, FontHandlerOptions{
		Family: family,
		Weight: weight,
		Text:   text,
	})
}

type FontHandlerOptions struct {
	Family string
	Weight string
	Text   string
}

func FontHandlerInternal(c echo.Context, options FontHandlerOptions) error {
	family := options.Family
	weight := options.Weight
	text := options.Text

	// normalize family by making the first letter uppercase
	family = strings.ToUpper(family[:1]) + strings.ToLower(family[1:])

	fontUrl := "https://fonts.googleapis.com/css2?family=" + family + ":wght@" + weight

	if text != "" {
		// encode text to be used in the url
		text = url.QueryEscape(text)
		fontUrl += "&text=" + text
	}

	req, err := http.NewRequest("GET", fontUrl, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1")

	// send the request
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	// read the body of the response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	// use regex to find the font url in the response body
	re := regexp.MustCompile(`src: url\((.+)\) format\('(opentype|truetype)'\)`)
	match := re.FindStringSubmatch(string(body))

	if len(match) < 2 {
		return echo.NewHTTPError(http.StatusNotFound, "No resource found")
	}

	// fetch the font
	fontResp, err := http.Get(match[1])
	if err != nil {
		return err
	}
	defer fontResp.Body.Close()

	// read the body of the font response
	fontBody, err := io.ReadAll(fontResp.Body)
	if err != nil {
		return err
	}

	c.Response().Header().Set("Content-Type", "font/ttf")
	c.Response().Header().Set("Cache-Control", "public, max-age=86400")

	return c.Blob(http.StatusOK, "font/ttf", fontBody)
}
