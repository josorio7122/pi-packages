import type { Job } from "./types.js";

const BLACKLISTED_COMPANY_SUBSTRINGS: string[] = [
  // Big consultancies & outsourcing
  "accenture", "cognizant", "infosys", "wipro", "tata consultancy", "tcs",
  "capgemini", "hcl technologies", "epam", "thoughtworks", "atos",
  "dxc technology", "unisys", "leidos", "booz allen", "deloitte", "kpmg",
  "pwc", "ernst & young", "ey consulting",
  // LATAM nearshore / staff augmentation
  "globant", "endava", "encora", "gorilla logic", "softserve", "wizeline",
  "applaudo", "rootstrap", "10pearls", "neoris", "softtek", "leanware",
  "truelogic", "bairesdev", "nagarro", "luxoft", "ci&t", "stefanini",
  // Developer marketplaces / contract platforms
  "toptal", "andela", "turing.com", "crossover", "arc.dev", "workana",
  "lemon.io", "proxify", "terminal.io", "revelo", "gun.io", "codementorx",
  "gigster", "x-team", "ubiminds",
  // Recruiters & staffing
  "experis", "robert half", "teksystems", "insight global", "hays",
  "randstad", "manpower", "adecco", "kelly services",
  // BPO / contact center (not tech product companies)
  "sitel", "teleperformance", "concentrix", "webhelp", "ttec", "majorel",
  "conduent",
  // Job aggregators / middlemen
  "jobgether", "hired.com", "vettery",
  // Detect by description patterns
  "staff augmentation", "nearshore", "outsourcing",
];

export const BLACKLISTED_DOMAINS: Set<string> = new Set([
  // Developer marketplaces
  "toptal.com", "andela.com", "bairesdev.com", "turing.com", "crossover.com",
  "arc.dev", "workana.com", "gun.io", "tempo.io", "lemon.io", "proxify.io",
  "revelo.com", "terminal.io", "codementor.io", "gigster.com",
  // Staffing agencies
  "experis.com", "roberthalf.com", "epam.com", "teksystems.com",
  "insightglobal.com", "hays.com", "randstad.com", "adecco.com",
  // LATAM nearshore
  "truelogic.io", "globant.com", "encora.com", "gorillalogic.com",
  "wizeline.com", "rootstrap.com", "softserve.com", "endava.com",
  // Job aggregators / middlemen
  "jobgether.com", "hired.com", "vettery.com",
  // General job boards (not direct employer)
  "dailyremote.com", "remoteok.com", "weworkremotely.com", "flexjobs.com",
  "remotefront.com", "careervault.io", "tallo.com", "jaabz.com",
  "remoterocketship.com", "dynamitejobs.com",
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
