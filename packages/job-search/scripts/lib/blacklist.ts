import type { Job } from "./types.js";

const BLACKLISTED_COMPANY_SUBSTRINGS: string[] = [
  "accenture",
  "cognizant",
  "infosys",
  "wipro",
  "tata consultancy",
  "tcs",
  "capgemini",
  "hcl technologies",
  "epam",
  "globant",
  "endava",
  "thoughtworks",
  "atos",
  "dxc technology",
  "unisys",
  "leidos",
  "booz allen",
  "deloitte",
  "kpmg",
  "pwc",
  "ernst & young",
  "ey consulting",
  "toptal",
  "andela",
  "bairesdev",
  "turing.com",
  "crossover",
  "arc.dev",
  "workana",
  "experis",
  "robert half",
  "teksystems",
  "nagarro",
  "luxoft",
  "softserve",
  "sitel",
  "teleperformance",
  "concentrix",
  "webhelp",
  "ttec",
  "majorel",
  "conduent",
  "stefanini",
  "ci&t",
  "ubiminds",
  "revelo",
  "x-team",
  "lemon.io",
  "jobgether",
];

export const BLACKLISTED_DOMAINS: Set<string> = new Set([
  "toptal.com",
  "andela.com",
  "bairesdev.com",
  "turing.com",
  "crossover.com",
  "arc.dev",
  "workana.com",
  "gun.io",
  "tempo.io",
  "experis.com",
  "roberthalf.com",
  "epam.com",
  "teksystems.com",
  "jobgether.com",
]);

export function isNotConsultancy(job: Job): boolean {
  const company = job.company.toLowerCase();
  const url = job.url.toLowerCase();

  for (const substring of BLACKLISTED_COMPANY_SUBSTRINGS) {
    if (company.includes(substring)) {
      return false;
    }
  }

  for (const domain of BLACKLISTED_DOMAINS) {
    if (url.includes(domain)) {
      return false;
    }
  }

  return true;
}
