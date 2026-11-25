export interface CatalogToolkit {
  slug: string;
  name: string;
  authSchemes: string[];
  composioManagedAuthSchemes: string[];
  noAuth: boolean;
  toolsCount: number;
  triggersCount: number;
}
