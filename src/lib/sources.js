// Outside data sources shown on the results dashboard ("Where our data comes from").
// Edit this list to change the names, descriptions or what each source feeds.
// Display text only: nothing here changes the scoring or the dollar figures.

export const DATA_SOURCES = [
  {
    key: 'nielsen',
    name: 'Nielsen',
    kind: 'Market and household data',
    what: 'Local cost of living, household spending and market benchmarks for the area around the job site.',
    feeds: ['Financial stress', 'Cost per exit'],
  },
  {
    key: 'google',
    name: 'Google',
    kind: 'Search, profiles and maps',
    what: 'Public search results and profiles to confirm we have the right person, plus maps for commute distance.',
    feeds: ['Profile match', 'Commute distance'],
  },
  {
    key: 'meta',
    name: 'Meta',
    kind: 'Facebook and Instagram',
    what: 'Recent public posts, read for stress phrases. Post text is never stored, only the phrases that matched.',
    feeds: ['Stress signals'],
  },
  {
    key: 'jobs',
    name: 'Job hiring websites',
    kind: 'Indeed, LinkedIn, Glassdoor, ZipRecruiter',
    what: 'Posted salary ranges by role and market, used to price what it costs to lose and replace each person.',
    feeds: ['Salary range', 'Replacement cost', 'Time at current job'],
  },
];

export const SALARY_SOURCE_NOTE = 'Salary ranges come from job hiring websites (Indeed, LinkedIn, Glassdoor, ZipRecruiter) for the same role and market.';
