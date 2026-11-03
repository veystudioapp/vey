import { parseLsof, parseNetstat, parseTasklist } from "../src/main/ports"
import { check, finish, section } from "./harness"

/**
 * The system bar's `Ports`: what `lsof` and `netstat` print, read as one row
 * per process and port.
 */

section("lsof")
{
  const output = [
    "p501",
    "cnode",
    "f23",
    "n*:3000",
    "f24",
    "n[::]:3000",
    "p77",
    "cpostgres",
    "f7",
    "n127.0.0.1:5432",
    "f8",
    "n[::1]:5432",
    "",
  ].join("\n")
  const rows = parseLsof(output)
  check("one row per process and port", rows.length === 2, rows)
  check(
    "sorted by port, with its process",
    rows[0]?.port === 3000 &&
      rows[0].pid === 501 &&
      rows[0].command === "node" &&
      rows[1]?.port === 5432 &&
      rows[1].command === "postgres",
    rows
  )
  check("a wildcard address is kept as written", rows[0]?.address === "*")
  check("nothing listening is no rows", parseLsof("").length === 0)
}

section("netstat")
{
  const names = parseTasklist(
    [
      '"node.exe","1234","Console","1","50,000 K"',
      '"svchost.exe","900","Services","0","9,000 K"',
    ].join("\r\n")
  )
  check("tasklist names by pid", names.get(1234) === "node.exe")

  const output = [
    "Active Connections",
    "",
    "  Proto  Local Address          Foreign Address        State           PID",
    "  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       1234",
    "  TCP    127.0.0.1:3000         127.0.0.1:51000        ESTABLISHED     1234",
    "  TCP    [::]:3000              [::]:0                 LISTENING       1234",
    "  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       900",
  ].join("\r\n")
  const rows = parseNetstat(output, names)
  check(
    "listeners only, one per process and port",
    rows.length === 2 && rows[0]?.port === 135 && rows[1]?.port === 3000,
    rows
  )
  check("named from tasklist", rows[1]?.command === "node.exe", rows[1])
}

finish()
