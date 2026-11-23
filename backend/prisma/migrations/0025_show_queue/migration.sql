-- Opcion: mostrar la cola completa en el celular de los clientes (por defecto si, como hasta ahora)
ALTER TABLE "Business" ADD COLUMN "showQueue" BOOLEAN NOT NULL DEFAULT true;
