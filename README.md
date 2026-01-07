docora
======

![logo](logo.svg)

# AI

```
read CLAUDE.md, README.md and all the files in docs folder. Now you are ready.
```


# DEV

launch main service

```bash
pnpm dev
```

test the code base

```bash
pnpm test -- --coverage
//view the test coverage
google-chrome coverage/index.html
```

# PROD

Environment variables needed in production:
DOMAIN=docora.toto-castaldi.com
CADDY_EMAIL=[XYZ]@[DOMAIN] //Email for Let's Encrypt notifications
