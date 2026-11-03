import { inOrder, moveId } from "../src/shared/folder-order"
import { check, finish, section } from "./harness"

/**
 * Reordering the projects in the rail: the move the renderer makes as a drag
 * lands, and the order main writes into the manifest.
 */

const list = ["a", "b", "c", "d"]
const join = (ids: string[]) => ids.join("")

section("moving one id")
check("to the front", join(moveId(list, "c", 0)) === "cabd")
check("to the end", join(moveId(list, "a", 3)) === "bcda")
check("one step down", join(moveId(list, "b", 2)) === "acbd")
check("one step up", join(moveId(list, "c", 1)) === "acbd")
check("onto its own place", join(moveId(list, "b", 1)) === "abcd")
check("past the end is the end", join(moveId(list, "a", 99)) === "bcda")
check("before the start is the start", join(moveId(list, "d", -3)) === "dabc")
check("an unknown id changes nothing", moveId(list, "z", 0) === list)
check("the input is left alone", join(list) === "abcd")

section("putting records in that order")
{
  const items = list.map((id) => ({ id }))
  const ids = (records: { id: string }[]) =>
    records.map((record) => record.id).join("")
  check(
    "follows the order given",
    ids(inOrder(items, ["d", "a", "c", "b"])) === "dacb"
  )
  check(
    "an unnamed record is kept, after the named ones",
    ids(inOrder(items, ["c", "a"])) === "cabd"
  )
  check(
    "an id naming nothing is ignored",
    ids(inOrder(items, ["z", "b", "a", "d", "c"])) === "badc"
  )
  check("nothing named keeps the list", ids(inOrder(items, [])) === "abcd")
}

finish()
