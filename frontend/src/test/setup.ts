import { configure } from "@testing-library/react";

// findBy and waitFor wait up to one second by default. On a busy machine (a full `make test`
// runs the database and the browser tooling too) that is not always enough for a screen to
// appear, which made tests fail at random. Waiting longer costs nothing when it is not needed.
configure({ asyncUtilTimeout: 5000 });
