CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "desc" TEXT NOT NULL DEFAULT '',
    "features" TEXT[],
    "badge" TEXT,
    "highlight" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Plan" ("id","name","price","desc","features","badge","highlight","sortOrder") VALUES
('STANDARD','Estándar',39900,'Todo Tono para un local.',ARRAY['QR por mesa','Cola con turnos y cupo','Pantalla y panel del DJ','Estadísticas'],NULL,false,0),
('CUSTOM','Diseño personalizado',49900,'Todo lo estándar, con la apariencia de tu local.',ARRAY['Todo lo del plan Estándar','Apariencia con la identidad de tu local'],'A la medida',true,1);
