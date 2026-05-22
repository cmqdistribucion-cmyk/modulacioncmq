export type Cliente = {
  id: string;
  title: string | null;
  numero_cliente: string;
  nombre: string | null;
  domicilio: string | null;
  vendedor: string | null;
  sv: string | null;
  telefono: string | null;
  zona: string | null;
};

export type ModulacionInput = {
  motivo: string;
  chofer: string;
  bultos: number;
  comentario: string;
};

