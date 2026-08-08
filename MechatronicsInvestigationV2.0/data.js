const data = {
  "CHARS": [
    {
      "id": "carlos",
      "name": "Carlos Mendoza",
      "role": "Téc. Mantenimiento Preventivo",
      "icon": "🔧",
      "col": "#f59e0b",
      "bio": "12 años en planta. Conoce cada tornillo. Frustrado porque sus informes de riesgo son ignorados."
    },
    {
      "id": "ana",
      "name": "Ana Robles",
      "role": "Ing. Automatización",
      "icon": "⚙️",
      "col": "#22c55e",
      "bio": "Recién certificada Siemens. Perfeccionista y resentida tras una mala evaluación injusta."
    },
    {
      "id": "luis",
      "name": "Luis Torres",
      "role": "Técnico Eléctrico",
      "icon": "⚡",
      "col": "#38bdf8",
      "bio": "Especialista en cableado industrial. Trabaja rápido, a veces demasiado rápido."
    },
    {
      "id": "maria",
      "name": "María Vega",
      "role": "Téc. Neumática/Hidráulica",
      "icon": "💧",
      "col": "#a855f7",
      "bio": "Única especialista en fluidos. Muy independiente, evita papeleo y procedimientos formales."
    },
    {
      "id": "roberto",
      "name": "Roberto Díaz",
      "role": "Técnico PLC y Control",
      "icon": "💻",
      "col": "#ef4444",
      "bio": "Programador autodidacta. Su código funciona, pero nadie más lo entiende ni lo puede auditar."
    },
    {
      "id": "none",
      "name": "Falla Natural",
      "role": "Desgaste por Ciclos",
      "icon": "🔩",
      "col": "#6b7280",
      "bio": "Ningún técnico es responsable. El componente llegó al fin de su vida útil de forma natural."
    }
  ],
  "LOCS": [
    {
      "id": "ensamble",
      "name": "Área de Ensamble",
      "icon": "🏭",
      "desc": "Corazón de la línea. Ensamblaje de componentes finales."
    },
    {
      "id": "control",
      "name": "Sala de Control",
      "icon": "🖥️",
      "desc": "Centro nervioso. Monitoreo de parámetros en tiempo real."
    },
    {
      "id": "almacen",
      "name": "Almacén de Refacciones",
      "icon": "📦",
      "desc": "Inventario de piezas. Acceso registrado con firma."
    },
    {
      "id": "subestacion",
      "name": "Subestación Eléctrica",
      "icon": "⚡",
      "desc": "Distribuye energía. Zona de alto voltaje y acceso restringido."
    },
    {
      "id": "soldadura",
      "name": "Línea de Soldadura",
      "icon": "🔥",
      "desc": "Robots de soldadura. Temperatura extrema y vibraciones constantes."
    }
  ],
  "CAUSES": [
    {
      "id": "fusible",
      "name": "Fusible Incorrecto",
      "icon": "🔌",
      "desc": "Fusible NH-15A instalado donde se requiere NH-25A."
    },
    {
      "id": "sensor",
      "name": "Sensor Desgastado",
      "icon": "📡",
      "desc": "Sensor inductivo con vida útil vencida en ambiente vibratorio."
    },
    {
      "id": "cable",
      "name": "Cable Cortocircuitado",
      "icon": "🔩",
      "desc": "Empalme con aislante inadecuado para la temperatura operativa."
    },
    {
      "id": "valvula",
      "name": "Válvula Incorrecta",
      "icon": "⚙️",
      "desc": "Válvula hidráulica con coeficiente de flujo erróneo (Cv diferente)."
    },
    {
      "id": "plc",
      "name": "PLC Modificado",
      "icon": "💾",
      "desc": "Bloque de programa editado sin autorización ni documentación."
    }
  ],
  "STORIES": [
    {
      "id": 0,
      "culprit": "carlos",
      "cause": "fusible",
      "location": "subestacion",
      "title": "Historia I — La Trampa del Preventivo",
      "incident": "06:42 AM — Línea 3 se detuvo con pérdida total de alimentación eléctrica. SCADA registró: \"Falla en Subestación Secundaria\". Pérdida: 847 piezas. Todos los técnicos convocados a sala de crisis.",
      "motive": "Carlos fue ignorado en la última auditoría: su informe sobre sobrecargas en la subestación fue descartado por gerencia. Durante su ronda nocturna (23:47 hrs) instaló un fusible NH-15A donde se requiere NH-25A, creando una \"trampa de tiempo\" para demostrar públicamente que sus advertencias eran válidas. La sobrecorriente sostenida cedió el fusible 7 horas después.",
      "ending": "Al confrontarlo con los logs de acceso a las 23:47 hrs, la firma en el retiro del fusible incorrecto del almacén y el fusible NH-15A encontrado en posición F-07 (donde todos son NH-25A), Carlos admitió el acto de desesperación. Fue suspendido 30 días sin goce. Irónicamente, su informe de riesgo fue aprobado e implementado como plan de mejora urgente de la subestación.",
      "clues": {
        "ensamble": { "hot": false, "text": "El operador de turno describe: \"Un pop suave, luego pérdida gradual de potencia en ~3 segundos\". Este perfil corresponde a un fusible cediendo por sobrecorriente sostenida, NO a un cortocircuito directo (que sería instantáneo). El componente falló de forma controlada y progresiva." },
        "control": { "hot": true, "text": "⚡ PISTA CLAVE: Logs SCADA muestran corriente escalando al 130% del nominal durante 8 minutos antes de la parada. Hay registro de acceso al panel de configuración eléctrica a las 23:47 hrs con credencial \"Mantenimiento Preventivo — C.Mendoza\"." },
        "almacen": { "hot": true, "text": "⚡ PISTA: El inventario registra un fusible NH-15A \"retirado y devuelto sin usar\" hace 3 días — firma: C. Mendoza. En la subestación solo se utilizan fusibles NH-25A. ¿Para qué retirarlo si no iba a instalarlo en ese momento?" },
        "subestacion": { "hot": true, "text": "⚡ EVIDENCIA DIRECTA: Posición F-07 del tablero principal contiene un fusible NH-15A (marcado en rojo) mientras todas las demás posiciones tienen NH-25A (azul). Marcas de guante en el tablero no corresponden a ningún mantenimiento programado esta semana." },
        "soldadura": { "hot": false, "text": "Luis Torres recuerda haber visto luz de linterna hacia la subestación alrededor de las 23:50 hrs. Lo atribuyó a una ronda de seguridad nocturna y no lo reportó. \"No era mi área, no quería parecer entrometido.\"" }
      }
    },
    {
      "id": 1,
      "culprit": "ana",
      "cause": "plc",
      "location": "control",
      "title": "Historia II — El Código Envenenado",
      "incident": "Fallas intermitentes en Línea 3 desde hace 4 días: la máquina falla SOLO cuando la cadencia supera el 85% de producción. Al reiniciar el PLC opera ~15 min antes de volver a fallar. Diagnóstico de hardware: sin anomalías. Los técnicos están desconcertados.",
      "motive": "Ana recibió una evaluación negativa por \"errores de programación\" en Línea 2, sintiéndose injustamente señalada. Para demostrar que las vulnerabilidades ya existían en el sistema, modificó el bloque FC47 del PLC de Línea 3 desde su terminal (02:15 hrs) introduciendo una condición de carrera en la gestión de timers que genera un bucle infinito al 85% de carga. Planeaba \"descubrirlo\" ella misma para rehabilitar su reputación.",
      "ending": "El análisis forense del servidor PLC reveló que FC47 fue editado a las 02:15 hrs del martes pasado desde la terminal ARobles_AT (ID: 4471). Las 3 líneas modificadas introducían deliberadamente una condición de carrera en la gestión de timers de ciclo de alta velocidad. Ana fue transferida a un departamento sin acceso a sistemas de producción. Se implementó autenticación de doble factor en todos los PLCs y auditoría obligatoria de cambios de código.",
      "clues": {
        "ensamble": { "hot": false, "text": "La falla ocurre ÚNICA Y EXCLUSIVAMENTE cuando la cadencia supera el 85% de velocidad. En ciclo lento la máquina opera perfectamente durante horas. Una falla eléctrica, mecánica o de hardware no discriminaría por velocidad de operación. Esto apunta directamente a la lógica de control." },
        "control": { "hot": true, "text": "⚡ EVIDENCIA DIRECTA: Log del servidor PLC: sesión de edición en bloque FC47 a las 02:15 hrs del martes pasado. Credenciales: ARobles_AT (ID: 4471 — Ana Robles). Tres líneas modificadas en la sección de gestión de timers de ciclo de alta velocidad." },
        "almacen": { "hot": false, "text": "Roberto prestó a Ana, hace 2 semanas, su manual técnico \"Gestión de Errores en Step 7\". Al revisarlo, hay Post-its marcados en páginas 112–115 sobre \"condiciones de carrera en Function Blocks de alta frecuencia\". Firmados con letra de Ana." },
        "subestacion": { "hot": false, "text": "Registros eléctricos de los últimos 7 días: voltaje estable ±2%, corriente dentro de parámetros, sin interferencias detectadas. La causa definitivamente no es eléctrica. El suministro de energía es irreprochable." },
        "soldadura": { "hot": true, "text": "⚡ PISTA: El robot RW-03 de soldadura perdió sincronía exactamente al mismo instante que la máquina principal en los 3 eventos de falla. Ambos comparten el bloque FC47 del PLC maestro como referencia de ciclo. La correlación es perfecta y matemáticamente improbable si fuera coincidencia." }
      }
    },
    {
      "id": 2,
      "culprit": "luis",
      "cause": "cable",
      "location": "soldadura",
      "title": "Historia III — Chispas de Descuido",
      "incident": "El servo-motor del brazo ensamblador presenta pérdidas de señal intermitentes desde hace 15 días. Duración de cada evento: menos de 200 ms, se recupera sola. Diagnóstico del motor: 100% nominal. La producción opera en modo degradado al 60%. La falla es completamente aleatoria e impredecible.",
      "motive": "Luis realizó mantenimiento de emergencia en la línea de soldadura el mes anterior con tiempo extra no remunerado. Con prisa, hizo un empalme en el cable del encoder del servo usando cinta 3M Serie 1700 (temperatura máxima: 60°C) en una zona del gabinete que alcanza 75–90°C en operación. Para no documentar el trabajo descuidado ni recibir un llamado de atención, no registró la intervención. El calor degradó el aislante hasta crear un cortocircuito intermitente.",
      "ending": "La inspección del gabinete de cableado del servo encontró un empalme tipo \"retorcido\" (técnica no aceptada por IEC 60364 para instalaciones permanentes) con cinta 3M gris deteriorada y marcas visibles de calor. El lote de la cinta coincidió con el kit personal de Luis. Al confrontarlo con la evidencia, Luis admitió el trabajo descuidado realizado con prisa bajo presión. Se implementó un protocolo obligatorio de auditoría post-mantenimiento con fotografías georreferenciadas.",
      "clues": {
        "ensamble": { "hot": false, "text": "El servo SV-201 está al 100% en todos los diagnósticos internos: devanado, rodamientos, encoder. El motor está perfectamente sano. El problema está en la comunicación del motor hacia el controlador, no en el motor mismo. Algo en el cableado intermedio falla." },
        "control": { "hot": false, "text": "⚡ PISTA: 31 alarmas de \"pérdida de señal encoder Eje-X\" registradas en 15 días, todas de 50–180 ms de duración, todas auto-recuperables. El patrón es de contacto eléctrico inestable (conexión intermitente), no falla permanente de componente. El aislante de algún cable se comporta de forma errática." },
        "almacen": { "hot": true, "text": "⚡ PISTA: Registro de materiales: \"Cinta Aislante 3M Serie 1700 (gris)\" retirada por Luis Torres hace 35 días para \"trabajo de emergencia en línea de soldadura\". Temperatura máxima de esa cinta: 60°C. Temperatura operativa del gabinete de soldadura zona alta: 75–90°C según termómetro infrarrojo de mantenimiento." },
        "subestacion": { "hot": false, "text": "María recuerda un pequeño \"chispazo\" visible desde el gabinete de cableado del servo de soldadura hace aproximadamente 3 semanas. Lo atribuyó a una descarga electrostática por la humedad del proceso. \"No parecía grave, esas cosas pasan con la soldadura.\"" },
        "soldadura": { "hot": true, "text": "⚡ EVIDENCIA DIRECTA: Gabinete de cableado del servo SV-201: empalme en el cable del encoder cubierto con cinta gris deteriorada, aislante parcialmente fundido y marcas claras de arco eléctrico. Técnica de empalme \"retorcido\" no cumple norma IEC para instalaciones industriales. No hay registro de ninguna intervención autorizada en ese punto." }
      }
    },
    {
      "id": 3,
      "culprit": "maria",
      "cause": "valvula",
      "location": "almacen",
      "title": "Historia IV — Presión Bajo el Silencio",
      "incident": "El actuador hidráulico del brazo de prensado lleva 10 días con presión en descenso progresivo. Hoy no alcanzó la presión mínima de operación (180 bar) y detuvo la línea. Sin fugas visibles en tuberías ni cilindros. Aceite en nivel y calidad normales.",
      "motive": "María encontró la válvula hidráulica original dañada durante su ronda de inspección. Para evitar los 2 días de espera de una requisición formal y el regaño del supervisor, tomó directamente del almacén una válvula \"que se veía idéntica\". La original requería VH-204A (Cv=3.2); la que tomó era VH-204B (Cv=1.8), un coeficiente de flujo 44% menor. No documentó el cambio para evitar consecuencias. La restricción progresiva generó la caída de presión sostenida.",
      "ending": "El desmontaje hidráulico reveló la válvula VH-204B instalada donde la especificación requería VH-204A. El número de serie la vinculó al inventario del almacén. El sistema WMS registraba \"extracción sin OT\" con credencial MV-047 (María Vega) hace exactamente 10 días, sin requisición ni autorización. María admitió la sustitución no autorizada. El proceso MOC (Management of Change) fue simplificado para urgencias y María recibió capacitación obligatoria en Gestión del Cambio industrial.",
      "clues": {
        "ensamble": { "hot": true, "text": "⚡ PISTA: SCADA muestra curva de presión hidráulica con caída lineal y perfectamente suave durante exactamente 10 días. Una falla abrupta de componente o una fuga sería instantánea o errática. Esta degradación matemáticamente lineal sugiere una restricción de flujo constante desde el inicio — algo instalado incorrectamente hace 10 días." },
        "control": { "hot": true, "text": "⚡ PISTA: Revisión de órdenes de trabajo: ninguna OT registrada para el sistema hidráulico del brazo de prensado en los últimos 30 días. Sin embargo, el cambio de comportamiento en los datos es claro y comienza hace exactamente 10 días. Alguien intervino en el sistema sin documentarlo." },
        "almacen": { "hot": true, "text": "⚡ EVIDENCIA DIRECTA: El WMS registra extracción de válvula VH-204 hace 10 días, credencial MV-047 (María Vega), SIN orden de trabajo ni firma de supervisor. La válvula no está en el stock físico actual. La VH-204B extraída tiene Cv=1.8 vs Cv=3.2 requerido. Una diferencia que, bajo carga completa, reduce el flujo un 44%." },
        "subestacion": { "hot": false, "text": "La bomba hidráulica muestra consumo eléctrico elevado: +22% en los últimos 10 días. El motor trabaja más duro para intentar compensar la restricción de flujo generada por la válvula incorrecta. Esto es una consecuencia del problema, no el origen." },
        "soldadura": { "hot": false, "text": "Carlos recuerda haber visto a María con su caja de herramientas roja cerca del área hidráulica del brazo de prensado hace aproximadamente 10 días, alrededor de las 14:30 hrs. \"Asumí que eran ajustes de rutina, ella siempre anda resolviendo cosas por su cuenta.\"" }
      }
    },
    {
      "id": 4,
      "culprit": "none",
      "cause": "sensor",
      "location": "ensamble",
      "title": "Historia V — La Máquina Agotada",
      "incident": "Fallas aleatorias e impredecibles en Línea 3 desde hace 3 semanas con frecuencia creciente: de 1 evento/día a 8 eventos/día. Sin correlación con acciones del personal ni condiciones específicas. Todos los técnicos fueron interrogados; ninguno reporta intervenciones recientes en el área.",
      "motive": null,
      "ending": "¡Nadie tuvo la culpa! El sensor inductivo SN-112 del área de ensamble llegó al fin de su vida útil. El núcleo ferroso sufrió desgaste natural tras 26 meses de operación continua en un ambiente con vibración de 3.1G RMS. La ficha técnica del fabricante (Pepperl+Fuchs, Serie NCB) especifica reemplazo preventivo a los 18 meses en ambientes con vibración superior a 2.5G. La falla fue del sistema de mantenimiento preventivo, no de un técnico. Se auditaron y sustituyeron todos los sensores similares con fecha de instalación superior a 18 meses en toda la planta.",
      "clues": {
        "ensamble": { "hot": true, "text": "⚡ EVIDENCIA DIRECTA: Sensor SN-112 en analizador portátil de señal: distancia de detección efectiva reducida de 8 mm (valor nominal) a 3.2 mm (−60% de capacidad). Cuerpo físico del sensor intacto sin daño visible, pero parámetros internos completamente fuera de especificación. Desgaste progresivo del núcleo ferroso interno." },
        "control": { "hot": true, "text": "⚡ PISTA: El histórico SCADA muestra variaciones de señal del SN-112 iniciando hace 3 semanas, con amplitud creciente de forma lineal (de 1 a 8 fallas/día). Este patrón es la \"curva de bañera ascendente\" — modelo matemático clásico de degradación por envejecimiento de componente electrónico. No corresponde a sabotaje ni intervención humana." },
        "almacen": { "hot": true, "text": "⚡ PISTA CLAVE: Ficha de instalación del SN-112 (lote NCB-F55K, Q4-2021): en servicio hace 26 meses. La hoja técnica Pepperl+Fuchs indica: \"Vida útil estimada: 18 meses en ambientes con vibración > 2.5G RMS\". El acelerómetro del bastidor de Línea 3 registra 3.1G RMS en operación normal. Debería haberse reemplazado hace 8 meses." },
        "subestacion": { "hot": false, "text": "Calidad de energía en subestación: voltaje estable ±1%, distorsión armónica THD <3%, sin sobretensiones registradas en 90 días de histórico. La causa eléctrica queda completamente descartada. El suministro es impecable." },
        "soldadura": { "hot": false, "text": "Roberto realizó revisión completa y manual del PLC maestro: sin modificaciones en 6 meses, código íntegro y correcto. \"El controlador responde perfectamente a las señales que recibe. El problema está en la señal misma — en el sensor que la genera, no en quien la procesa.\"" }
      }
    }
  ]
};

export default data;
