declare module "../../prisma/cepro-methodology.mjs" {
  export type CeproRule = { targetKey:string; targetLabel:string; name:string; intervalValue:number|null; intervalUnit:"DAYS"|"WEEKS"|"MONTHS"|"YEARS"|"OPERATING_HOURS"|"USAGE_COUNT"|null; performedBy:string; type:string; trigger:string; article?:string|null; note?:string|null };
  export const CEPRO_RULES: CeproRule[];
  export const CEPRO_SOURCE: Record<string, unknown>;
  export const CEPRO_CHECKLISTS: Array<[string,string,string[]]>;
}
