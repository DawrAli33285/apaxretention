// Credit balances are stored in whole cents and changed with one atomic
// statement (see users.adjustCredits in server/db/repo.js), so there is no
// rounding drift and two requests can never spend the same money.
const { users, toCents, dollars } = require('../db/repo');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Change a balance by a dollar amount. Returns the user, or null when funds are short. */
const adjustCredits = (userId, deltaDollars, opts) => users.adjustCredits(userId, toCents(deltaDollars), opts);

module.exports = { adjustCredits, round2, toCents, dollars };
