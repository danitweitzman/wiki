## Running

From the command line confirm that your current working directory is the root of
the project.

```bash
pwd
```

Option 1: run the app directly

```bash
deno run -A src/main.js
```

Option 2: use the tesk defined in deno.json

```bash
deno task start
```

When you are done, shut it down by typing `ctrl-c` in the terminal.

## Troubleshooting

**error: AddrInUse: Address already in use** This error can happen if your app
exits without properly closing the server . You can fix this by killing the
process that is using the port.

```
kill -9 $(lsof -t -i:8000)
```
