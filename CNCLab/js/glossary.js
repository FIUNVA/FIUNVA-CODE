/* ============================================================
   GLOSARIO — qué acepta y qué hace REALMENTE este simulador.
   El contenido está verificado contra el intérprete: una entrada
   no documenta lo que hace un torno FANUC, sino lo que hace el
   código de este proyecto. Por eso hay una sección entera de
   códigos que se aceptan y se ignoran, y otra con el texto
   literal de los avisos que el panel de observaciones puede
   emitir.
   ============================================================ */
const GLOSSARY = [
  /* ---------- Movimiento: los únicos G modales ---------- */
  {
    group: 'Movimiento (G modales)',
    code: 'G00',
    name: 'Posicionamiento rápido',
    desc: 'Desplaza la herramienta en X y/o Z sin cortar. Es modal: sigue vigente en los bloques siguientes hasta que aparezca otro G0-G3. No se dibuja retirada de material ni deja marca en la pieza.',
    example: 'G00 X-55. Z0.;',
  },
  {
    group: 'Movimiento (G modales)',
    code: 'G01',
    name: 'Interpolación lineal',
    desc: 'Avanzo recto entre dos puntos; sí corta material. Es el modo que el simulador fuerza al resolver el perfil de un G71 o G72, de modo que un bloque del perfil sin G explícito se interpreta como corte lineal.',
    example: 'G01 X0. F0.1;',
  },
  {
    group: 'Movimiento (G modales)',
    code: 'G02',
    name: 'Arco en sentido horario (CW)',
    desc: 'Arco con avance, descrito con el radio R. Solo se admite el arco menor, de 180° o menos. Si falta R el bloque no se corta como arco: se avisa y el tramo se dibuja recto.',
    example: 'G02 X-10. Z-3. R3.;',
  },
  {
    group: 'Movimiento (G modales)',
    code: 'G03',
    name: 'Arco en sentido antihorario (CCW)',
    desc: 'Igual que G02 pero al revés. Comparte las mismas reglas: radio R obligatorio, arco menor y sin soporte de I/J.',
    example: 'G03 X20. Z-7.5 R1.5;',
  },
  {
    group: 'Movimiento (G modales)',
    code: 'Modalidad',
    name: 'Solo G00-G03 son modales',
    desc: 'G28, G70, G71 y G72 actúan una sola vez, en su bloque. Cualquier otro G —G21, G40, G50, G96, G99 o uno inventado— no cambia el modo de movimiento: el bloque anterior sigue mandando.',
    example: 'G21 G40 G99;   (no hace nada)',
  },

  /* ---------- Ciclos ---------- */
  {
    group: 'Ciclos de torneado',
    code: 'G71',
    name: 'Desbaste longitudinal (eje X)',
    desc: 'Repite pasadas horizontales desde el exterior hacia el perfil, dejando el material en escalera. Se programa en dos líneas: la primera da U = profundidad de pasada y R = retracción; la segunda da P, Q y las allowances U/W. La profundidad U se interpreta como radio, no como diámetro. Si U falta o no es positiva, el ciclo se omite y se avisa.',
    example: 'G71 U1.5 R0.5;\nG71 P1 Q9 U0.25 W0.25;',
  },
  {
    group: 'Ciclos de torneado',
    code: 'G72',
    name: 'Desbaste frontal (eje Z)',
    desc: 'La misma idea que G71 pero en el otro eje: avanza en franjas de Z de altura W, cortando hacia dentro en X, y R es la retracción en Z. También se programa en dos líneas, y la allowance W de la segunda línea NO es la profundidad: la profundidad es la W de la primera. Sin W positiva el ciclo se omite y se avisa.',
    example: 'G72 W1.5 R0.5;\nG72 P1 Q12 U0.25 W0.25;',
  },
  {
    group: 'Ciclos de torneado',
    code: 'G70',
    name: 'Acabado del contorno',
    desc: 'Repite el perfil N(P) a N(Q) en material real, sin allowances, y es lo que deja la pieza acabada. Entra con un rápido hasta el punto en el que arranca el primer bloque de corte del perfil, saltándose los movimientos de posicionamiento que lo abren. Los puntos P0, P1, P2… de la capa "Puntos de contorno" salen de aquí.',
    example: 'G70 P1 Q12;',
  },
  {
    group: 'Ciclos de torneado',
    code: 'G28',
    name: 'Vuelta al punto de referencia',
    desc: 'Regresa al cero máquina pasando antes por un punto intermedio, que se calcula con U/W o con X/Z si el bloque los lleva. Ese cero no es el de una máquina real: lo deduce la propia aplicación a partir de la geometría del programa. Es la misma posición que dibuja el botón HOME.',
    example: 'G28 W0. M05;\nG28 U0. M09;',
  },
  {
    group: 'Ciclos de torneado',
    code: 'Allowances U / W',
    name: 'Margen que se deja para el acabado',
    desc: 'La U y la W de la segunda línea de G71/G72 no se restan por ejes: se aplican sobre la normal del contorno, con U en su componente de X y W en la de Z. En un hombro a 45°, "U0.25 W0.25" deja 0.35 mm reales de material, no 0.25.',
    example: 'G71 P1 Q9 U0.25 W0.25;',
  },
  {
    group: 'Ciclos de torneado',
    code: 'G75',
    name: 'Ranurado y corte (dos bloques)',
    desc: 'Ciclo fijo de ranurado: no usa perfil N(P)-N(Q), funciona entero en sus dos bloques. El primero solo da R, la retracción tras cada mordida. El segundo dispara el ciclo con X (diámetro final, se lee como radio), Z opcional, P = incremento por mordida y F = avance. El ciclo avanza en X hacia el diámetro final mordida a mordida, retrae R en rápido y vuelve a la Z inicial; si el bloque lleva Z, cada mordida avanza también en Z. Sin P positiva, o sin X ni U, el ciclo se omite y se avisa. Dos simplificaciones del simulador: el plunge sin Z se dibuja con el ancho fijo del inserto (3 mm), porque el G75 de FANUC no lleva palabra de herramienta; y un corte a X0 se trata como plano de corte, no como refrentado, de modo que la pieza terminada se conserva. El corte abre únicamente la banda del ancho del inserto, centrada en la Z de la herramienta, así que se lleva por delante 1,5 mm de la cara trasera de la pieza y 1,5 mm del recorte: el resto de la barra, detrás, queda intacto y cada mordida solo profundiza la ranura, nunca la ensancha. Para que esa separación se vea, cuando el programa corta a X0 el simulador dibuja 10 mm de barra por detrás del plano, del lado de la mordaza; en ese caso la cara de la barra coincide con el cero pieza, así que el contorno de la barra no lo rebasa. Un ciclo que para exactamente en X0 deja un tetón: el radio de punta de la inserción no alcanza el centro del recorte, así que queda un núcleo pequeño de material de pie sobre la cara de la barra y la pieza sigue colgando de él. Sobrepasar el eje (X-1.5) corta de lado a lado y deja la cara limpia, que es la comparación que explica por qué en la práctica se tronza pasado el eje en lugar de parar en él.',
    example: 'G75 R0.5;\nG75 X12.5 P1500 F0.05;',
  },
  {
    group: 'Ciclos de torneado',
    code: 'G76',
    name: 'Roscado multipasada (dos bloques)',
    desc: 'Ciclo de roscar en varias pasadas, también en dos bloques. El primero: P con seis dígitos, que reparte tres pares — nn pasadas de acabado, rr chaflán de salida y aa ángulo de la punta en grados—, Q = profundidad mínima de pasada y R = margen que se reserva para el acabado. El segundo: X = diámetro del núcleo (raíz), Z = final de la rosca, R = conicidad, P = altura del hilo, Q = profundidad de la primera pasada y F = PASO de la rosca. El chaflán rr alarga cada pasada ese mismo valor en Z más allá del final de la rosca. El ángulo aa se lee pero no se usa: el perfil se recorta siempre como un triángulo simétrico de 60°, así que un 55 de Whitworth se dibujaría igual que un 60 métrico. Las pasadas siguen la progresión de raíz cuadrada de FANUC y después las de acabado a altura completa. Cada una es un avance sincronizado a lo largo de Z, no un barrido, así que la rosca no es un surco: la forma real del hilo se recorta dentro de la silueta del material y los dientes son la propia silueta, con el rayado transversal dibujado encima. Si el primer bloque no se reconoce, se pierde el margen R y el P de seis dígitos, y se avisa.',
    example: 'G76 P020060 Q100 R0.02;\nG76 X13.55 Z-27. P1227 Q250 F2.0;',
  },
  {
    group: 'Ciclos de torneado',
    code: 'P en G75 / G76',
    name: 'El P de los ciclos es milimétrico',
    desc: 'En G71/G72 P y Q son números de bloque. En G75 y G76, en cambio, P es una longitud en micras: "P1500" son 1.5 mm por mordida y "P1227" son 1.227 mm de altura de hilo. El simulador no escala P, así que un valor sin punto decimal se interpreta como milésimas igual que las demás letras.',
    example: 'G75 X12.5 P1500 F0.05;',
  },

  /* ---------- Husillo, refrigeración, fin ---------- */
  {
    group: 'Husillo, refrigeración y fin',
    code: 'M03',
    name: 'Husillo en sentido horario',
    desc: 'Arranca el husillo CW. En la convención de este simulador el husillo CW lleva la herramienta DEBAJO del eje, así que se programa con X NEGATIVO. El panel lo muestra como "M03 abajo"; si el programa usa X positivo se avisa.',
    example: 'G50 S2500 M03;',
  },
  {
    group: 'Husillo, refrigeración y fin',
    code: 'M04',
    name: 'Husillo en sentido antihorario',
    desc: 'Arranca el husillo CCW, herramienta ARRIBA del eje, y se programa con X POSITIVO. El panel lo muestra como "M04 arriba"; si el programa usa X negativo se avisa.',
    example: 'G50 S2500 M04;',
  },
  {
    group: 'Husillo, refrigeración y fin',
    code: 'M05',
    name: 'Husillo OFF',
    desc: 'Para el husillo y apaga su indicador en el panel.',
    example: 'M05',
  },
  {
    group: 'Husillo, refrigeración y fin',
    code: 'M08',
    name: 'Refrigeración ON',
    desc: 'Enciende el refrigerante y su indicador.',
    example: 'G96 S150 M08;',
  },
  {
    group: 'Husillo, refrigeración y fin',
    code: 'M09',
    name: 'Refrigeración OFF',
    desc: 'Apaga el refrigerante y su indicador.',
    example: 'M09',
  },
  {
    group: 'Husillo, refrigeración y fin',
    code: 'M30 / M02',
    name: 'Fin de programa',
    desc: 'Se registra como final, pero NO detiene la simulación: los bloques que vengan después se siguen interpretando y ejecutando. En una máquina real M30 para el programa; aquí solo es una marca.',
    example: 'M30;',
  },

  /* ---------- Letras ---------- */
  {
    group: 'Letras direccionales y de ciclo',
    code: 'X',
    name: 'Posición absoluta en diámetro',
    desc: 'Siempre se programa en DIÁMETRO, también en el interior de un radio, un allowance o un arco: el simulador lo divide entre dos al leerlo. El panel lo muestra como "X (Ø)" con el mismo criterio. El signo indica el lado: negativo = herramienta abajo (M03), positivo = arriba (M04).',
    example: 'G01 X-40.;  → radio real -20.',
  },
  {
    group: 'Letras direccionales y de ciclo',
    code: 'Z',
    name: 'Posición absoluta en el eje longitudinal',
    desc: 'Z0 es el cero pieza, la cara derecha de la pieza. Los valores negativos se alejan hacia la cola. No se divide entre dos: Z es una longitud, no un diámetro.',
    example: 'G01 Z-14.;',
  },
  {
    group: 'Letras direccionales y de ciclo',
    code: 'U',
    name: 'Incremento en X (radio)',
    desc: 'Fuera de los ciclos es un desplazamiento incremental en X y se lee como radio, así que U1. mueve 0.5 mm reales. Dentro de G71/G72 su significado depende de la línea: profundidad de pasada en la primera, allowance radial en la segunda.',
    example: 'G01 U-2.;',
  },
  {
    group: 'Letras direccionales y de ciclo',
    code: 'W',
    name: 'Incremento en Z',
    desc: 'Fuera de los ciclos es un desplazamiento incremental en Z, sin dividir entre dos. Dentro de G71/G72 es la profundidad en la primera línea y la allowance axial en la segunda.',
    example: 'G01 W-1.;',
  },
  {
    group: 'Letras direccionales y de ciclo',
    code: 'R',
    name: 'Radio de arco o retracción',
    desc: 'Dos significados según el contexto: en G02/G03 es el radio del arco, y siempre se elige la solución de arco menor; en la primera línea de G71/G72 es la retracción de la pasada, en el eje propio de cada ciclo.',
    example: 'G02 X-10. Z-3. R3.;',
  },
  {
    group: 'Letras direccionales y de ciclo',
    code: 'F',
    name: 'Avance',
    desc: 'Se guarda y se muestra en el panel (F), pero NO gobierna la velocidad de la simulación: el ritmo lo fija el control VEL. de la barra. Programarlo sigue siendo buena práctica.',
    example: 'G01 X0. F0.1;',
  },
  {
    group: 'Letras direccionales y de ciclo',
    code: 'S',
    name: 'Velocidad de husillo',
    desc: 'Se guarda y se muestra en el panel (S) tal cual se escribe, sin convertir a rpm reales ni a velocidad de corte. El G96 que suele acompañar al S no tiene efecto (ver la sección de códigos sin efecto).',
    example: 'G96 S150;',
  },
  {
    group: 'Letras direccionales y de ciclo',
    code: 'T',
    name: 'Número de herramienta',
    desc: 'Registra la herramienta activa y la muestra en el panel como cuatro dígitos. No hay torreta real, pero el buril de la simulación SÍ cambia de color según la estación (las dos primeras cifras): T01 verde, T02 azul para el ranurado y el corte, T03 rojo para el roscado. Cualquier otra estación, y también las llamadas de anulación como T0100, conservan el color de su estación.',
    example: 'G00 T0101;',
  },
  {
    group: 'Letras direccionales y de ciclo',
    code: 'T01',
    name: 'Estación 1 — torneado',
    desc: 'La estación de torneado general: la placa que ejecuta el refrentado y los ciclos G71 y G70 de los cuatro ejemplos. En un torno real es un portaherramientas con placa de metal duro y punta pequeña, para que el filo aguante el canto en vez de rasgar la pieza. En el simulador no hay torreta ni geometría de placa: el número solo se muestra en el panel como cuatro dígitos y tiñe el buril, que en esta estación es verde. Las dos primeras cifras son la estación y las dos últimas la corrección, así que T0100 —anular corrección— sigue siendo estación 1 y conserva el color.',
    example: 'G00 T0101;',
  },
  {
    group: 'Letras direccionales y de ciclo',
    code: 'T02',
    name: 'Estación 2 — ranurado y corte',
    desc: 'La estación de ranurado: placa estrecha y más resistente, la que ejecuta los dos G75 del ejemplo 4, el desahogo de Z-31 y el corte de la pieza. Su ancho importa de verdad, y aquí es una constante del simulador y no una consecuencia del número T: el G75 de FANUC no lleva palabra de herramienta, así que el plunge sin Z se dibuja con un ancho fijo de 3 mm y el corte abre una ranura de 3 mm. Cambiar T02 por cualquier otra estación no movería ni un milímetro del corte. En pantalla el buril es azul.',
    example: 'T0202;\nG75 R0.5;\nG75 X0. P2000 F0.04;',
  },
  {
    group: 'Letras direccionales y de ciclo',
    code: 'T03',
    name: 'Estación 3 — roscado',
    desc: 'La estación de roscado: placa con perfil en punta que se sincroniza con el husillo, la que ejecuta el G76. Su ángulo de punta es lo que define el perfil del hilo, y en un G76 se programa en el par aa del P de seis dígitos del primer bloque. Aquí también es una constante: el simulador lee ese aa y lo ignora, y recorta siempre un perfil de 60° simétrico. En pantalla el buril es rojo.',
    example: 'T0303;\nG76 P020060 Q100 R0.02;\nG76 X13.55 Z-27. P1227 Q250 F2.0;',
  },
  {
    group: 'Letras direccionales y de ciclo',
    code: 'N',
    name: 'Etiqueta de bloque',
    desc: 'Numera un bloque sin producir movimiento. Es lo que P y Q referencian para delimitar el perfil de un ciclo; las mismas etiquetas se usan en G70 para repetir ese contorno.',
    example: 'N1 G01 X-4. F0.1;',
  },
  {
    group: 'Letras direccionales y de ciclo',
    code: 'P / Q',
    name: 'Extremos del perfil',
    desc: 'Solo tienen sentido dentro de G71, G72 y G70: P marca el bloque inicial del perfil y Q el final, referenciados por su número N. Si alguna de las dos etiquetas no existe, el ciclo se marca inválido y se avisa.',
    example: 'G71 P1 Q9 U0.25 W0.25;',
  },
  {
    group: 'Letras direccionales y de ciclo',
    code: 'O',
    name: 'Número de programa',
    desc: 'Se acepta y se lee, pero no se usa para nada. Es la primera línea de todos los ejemplos.',
    example: 'O0003;',
  },

  /* ---------- Códigos que no hacen nada ---------- */
  {
    group: 'Se aceptan pero NO hacen nada',
    code: 'G21 / G20',
    name: 'Milímetros o pulgadas',
    desc: 'No está implementado: el simulador trabaja siempre en milímetros. Se puede escribir sin que salga ningún aviso.',
    example: 'G21 G40 G99;',
  },
  {
    group: 'Se aceptan pero NO hacen nada',
    code: 'G40 / G80',
    name: 'Cancelar compensación o ciclo',
    desc: 'No hay compensación ni ciclos cancelables que anular: el perfil de un G71/G72 se resuelve una vez y se reutiliza tal cual. Se aceptan en silencio.',
    example: 'G40',
  },
  {
    group: 'Se aceptan pero NO hacen nada',
    code: 'G50',
    name: 'Límite de velocidad y cero pieza',
    desc: 'En un torno real fija la velocidad máxima y puede fijar el cero de trabajo. Aquí solo se lee el S que le acompaña; su efecto sobre la geometría es nulo. Aparece en la cabecera de los tres ejemplos.',
    example: 'G50 S2500 M03;',
  },
  {
    group: 'Se aceptan pero NO hacen nada',
    code: 'G96 / G97',
    name: 'Velocidad de corte constante o fija',
    desc: 'No hay simulación de velocidad de corte: el S se muestra tal cual se escribió, sin convertir a rpm según el diámetro. Es el motivo de que los ejemplos usen S150 sin que signifique 150 rpm.',
    example: 'G96 S150 M08;',
  },
  {
    group: 'Se aceptan pero NO hacen nada',
    code: 'G98 / G99',
    name: 'Plano de retorno tras el ciclo',
    desc: 'Los ciclos no usan el concepto de plano de retorno: el simulador aplica su propia retracción R. Se aceptan en silencio.',
    example: 'G99',
  },
  {
    group: 'Se aceptan pero NO hacen nada',
    code: 'Cualquier otro G',
    name: 'La regla general',
    desc: 'Se analiza, se dibuja en el editor y no produce efecto alguno ni aviso. Además no altera el modo de movimiento: el G0-G3 vigente sigue vigente después de la línea.',
    example: 'G18 G54 G80 G95;',
  },

  /* ---------- Sintaxis ---------- */
  {
    group: 'Reglas de sintaxis',
    code: ';',
    name: 'Fin de bloque obligatorio',
    desc: 'Cada bloque tiene que terminar en punto y coma. Un bloque sin él se descarta ENTERO, no se interpreta "lo que se pueda": el panel de observaciones lo marca en ámbar.',
    example: 'G00 X0. Z0.   ← esta línea no se ejecuta',
  },
  {
    group: 'Reglas de sintaxis',
    code: '( )',
    name: 'Comentarios',
    desc: 'Todo lo que va entre paréntesis se elimina antes de analizar la línea, en cualquier posición. El punto y coma también comenta el resto de la línea.',
    example: 'G00 X-55. (aproximación);',
  },
  {
    group: 'Reglas de sintaxis',
    code: '%',
    name: 'Corte de línea',
    desc: 'Todo lo que venga después de un % se descarta, así que sirve para separar tramos de un programa largo.',
    example: 'G28 U0. M09;%',
  },
  {
    group: 'Reglas de sintaxis',
    code: 'Punto decimal',
    name: 'Sin punto decimal = milésimas',
    desc: 'X, Z, U, W, R y F escritos SIN punto decimal se leen en milésimas de milímetro, y se avisa: X100 significa 0.100, no 100. La regla no afecta a S, T, N, P, Q, M ni G, así que S2500 son 2500 y no 2.5.',
    example: 'X100  →  0.100\nS2500  →  2500',
  },
  {
    group: 'Reglas de sintaxis',
    code: 'I / J',
    name: 'Centros de arco no soportados',
    desc: 'Los arcos se describen solo con R. Un bloque programado con I o J en lugar de R se queda sin radio: se avisa y el tramo se dibuja recto.',
    example: 'G02 X-10. Z-3. I-2. K-1.;  → recta + aviso',
  },
  {
    group: 'Reglas de sintaxis',
    code: 'Minúsculas',
    name: 'Mayúsculas y minúsculas',
    desc: 'Las letras admiten mayúsculas y minúsculas: x-40. y X-40. son lo mismo. Los valores llevan signo explícito opcional.',
    example: 'g01 x-40.;',
  },

  /* ---------- Avisos ---------- */
  {
    group: 'Avisos que puede emitir',
    code: '1',
    name: 'Falta el punto y coma',
    desc: 'El bloque entero se ignora. Aparece en ámbar, con el número de línea, en el panel de observaciones y en el resaltado del editor.',
    example: 'Falta punto y coma (;) al final del bloque — la línea se ignora por completo.',
  },
  {
    group: 'Avisos que puede emitir',
    code: '2',
    name: 'Valor sin punto decimal',
    desc: 'Se ha interpretado en milésimas de milímetro, indicando el valor realmente usado.',
    example: "'X100' sin punto decimal — interpretado en milésimas de mm (X0.1)",
  },
  {
    group: 'Avisos que puede emitir',
    code: '3',
    name: 'Punto decimal de más',
    desc: 'Se ha ignorado el punto sobrante y se explica con qué valor se ha interpretado.',
    example: "se ignoró un punto decimal adicional en 'X-18.5.' (interpretado como X-18.5)",
  },
  {
    group: 'Avisos que puede emitir',
    code: '4',
    name: 'Valor no numérico',
    desc: 'Una letra seguida de algo que no es un número: esa palabra se descarta y se avisa.',
    example: "valor no numérico tras 'X'",
  },
  {
    group: 'Avisos que puede emitir',
    code: '5',
    name: 'Arco sin radio',
    desc: 'Un G02 o G03 sin R no se puede resolver como arco, así que el tramo se dibuja recto.',
    example: 'G02/G03 sin radio R — se interpreta como línea recta',
  },
  {
    group: 'Avisos que puede emitir',
    code: '6',
    name: 'Radio menor que la cuerda',
    desc: 'El radio pedido es más pequeño que la mitad de la distancia entre los dos puntos, así que no existe el arco: se aproxima con un semicírculo.',
    example: 'Radio de arco menor que la cuerda — geometría aproximada',
  },
  {
    group: 'Avisos que puede emitir',
    code: '7',
    name: 'G71 sin profundidad',
    desc: 'La primera línea del ciclo no trae una U positiva, de modo que el desbaste no se ejecuta. La pieza se queda sin quitar material en esa zona.',
    example: 'G71 sin profundidad de pasada (U) válida — ciclo omitido',
  },
  {
    group: 'Avisos que puede emitir',
    code: '8',
    name: 'G72 sin profundidad',
    desc: 'Igual que el anterior pero en el ciclo frontal: falta la W positiva de la primera línea.',
    example: 'G72 sin profundidad de pasada (W) válida — ciclo omitido',
  },
  {
    group: 'Avisos que puede emitir',
    code: '9',
    name: 'Etiquetas N(P) o N(Q) inexistentes',
    desc: 'El ciclo apunta a un número de bloque que no está en el programa, así que se marca inválido y no se ejecuta.',
    example: 'G71: no se encontraron las etiquetas N1/N9',
  },
  {
    group: 'Avisos que puede emitir',
    code: '10',
    name: 'Husillo y signo de X cruzados',
    desc: 'Se comprueba el primer avance del programa: M03 con X positivo, o M04 con X negativo, contradicen la convención de la herramienta y se avisa. El programa se sigue simulando.',
    example: 'M03 (herramienta abajo) normalmente se programa con valores de X negativos; este programa usa X positivo.\nM04 (herramienta arriba) normalmente se programa con valores de X positivos; este programa usa X negativo.',
  },
  {
    group: 'Avisos que puede emitir',
    code: '11',
    name: 'Error interno',
    desc: 'Si la interpretación falla por un motivo inesperado, el panel de observaciones muestra el mensaje del error y el gráfico se VACÍA: un programa que no se pudo interpretar no puede dejar en pantalla el dibujo del anterior, que es lo que hacía pasar por bueno un programa roto.',
    example: 'Error interno al interpretar el programa: ...',
  },
  {
    group: 'Avisos que puede emitir',
    code: '12',
    name: 'G75 o G76 en un solo bloque',
    desc: 'Los dos ciclos necesitan dos bloques (uno con R o P/Q/R y otro con el movimiento). Un bloque que no encaja en ninguno de los dos formatos no hace nada y se avisa, en vez de descartarse en silencio.',
    example: 'G75: bloque no reconocido — ...\nG76: bloque no reconocido — se esperan dos bloques, ...',
  },
  {
    group: 'Avisos que puede emitir',
    code: '13',
    name: 'G75 sin datos de corte',
    desc: 'Falta el incremento de mordida P, falta X o U (la profundidad a la que debe cortar), o se superaron las 500 mordidas de seguridad. En los dos primeros casos el ciclo no se ejecuta; en el último se trunca y se avisa.',
    example: 'G75 sin incremento de pasada (P) válido — ciclo omitido\nG75 sin X ni U (profundidad del ciclo) — ciclo omitido\nG75: límite de pasadas alcanzado — ciclo truncado',
  },
  {
    group: 'Avisos que puede emitir',
    code: '14',
    name: 'G76 sin datos de rosca',
    desc: 'Falta la altura de hilo (P del segundo bloque), falta el paso (F), o falta la profundidad mínima de pasada Q. En cualquiera de los tres casos el roscado no se ejecuta.',
    example: 'G76 sin altura de hilo (P bloque 2) válida — ciclo omitido\nG76 sin paso de rosca (F) válido — ciclo omitido\nG76 sin profundidad mínima de pasada (Q) válida — ciclo omitido',
  },
];

/* ---------- Render ---------- */
/* Grouped into one <section> per group, not one running list: it is what the
   index jumps to, and it keeps the group boundaries readable at full width. */
function glossarySections(hits) {
  const sections = [];
  for (const e of hits) {
    const last = sections[sections.length - 1];
    if (!last || last.group !== e.group) {
      sections.push({ group: e.group, id: 'glossarySec' + sections.length, entries: [] });
    }
    sections[sections.length - 1].entries.push(e);
  }
  return sections;
}

function glossaryEntryHtml(e) {
  return `<div class="glossaryEntry">`
    + `<div class="glossaryHead2"><code class="glossaryCode">${escapeHtml(e.code)}</code>`
    + `<span class="glossaryName">${escapeHtml(e.name)}</span></div>`
    + `<p class="glossaryDesc">${escapeHtml(e.desc).replace(/\n/g, '<br>')}</p>`
    + `<pre class="glossaryExample">${escapeHtml(e.example)}</pre>`
    + `</div>`;
}

function glossaryRender(query) {
  const q = (query || '').trim().toLowerCase();
  const total = GLOSSARY.length;
  const hits = q
    ? GLOSSARY.filter(e => (e.code + ' ' + e.name + ' ' + e.desc + ' ' + e.example).toLowerCase().includes(q))
    : GLOSSARY;
  const sections = glossarySections(hits);

  el.glossaryBody.innerHTML = sections.length
    ? sections.map(s => `<section class="glossaryGroup" id="${s.id}">`
      + `<h3 class="glossaryGroupTitle">${escapeHtml(s.group)}</h3>`
      + `<div class="glossaryGrid">${s.entries.map(glossaryEntryHtml).join('')}</div>`
      + `</section>`).join('')
    : '<div class="glossaryEmpty">Ninguna entrada coincide con la búsqueda.</div>';

  // The index only ever offers sections that actually have results.
  el.glossaryToc.innerHTML = sections
    .map(s => `<button type="button" data-target="${s.id}">${escapeHtml(s.group)}</button>`).join('');

  el.glossaryCount.textContent = q ? `${hits.length} de ${total}` : `${total} entradas`;
}

el.glossaryToc.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-target]');
  if (!btn) return;
  const target = document.getElementById(btn.dataset.target);
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
el.glossarySearch.addEventListener('input', () => glossaryRender(el.glossarySearch.value));

/* ---------- Open / close ---------- */
/* The view covers the page, so it behaves like navigation: the hash keeps it
   shareable, the browser's Back button closes it, and going back to the
   simulator is instant because nothing behind the view was ever torn down. */
const GLOSSARY_HASH = '#glosario';

function glossaryOpen(pushHistory) {
  if (!el.glossaryPage.hidden) return;
  el.glossaryPage.hidden = false;
  el.glossarySearch.value = '';
  glossaryRender('');
  el.glossaryPage.scrollTop = 0;
  if (pushHistory && location.hash !== GLOSSARY_HASH) {
    history.pushState({ glossary: true }, '', GLOSSARY_HASH);
  }
  el.glossarySearch.focus();
}

function glossaryClose() {
  if (el.glossaryPage.hidden) return;
  // Leaving through history keeps the Back button from stranding the user on a
  // #glosario entry; popstate then does the hiding, with no history of its own.
  if (location.hash === GLOSSARY_HASH) history.back();
  else glossaryHide();
}

function glossaryHide() {
  if (el.glossaryPage.hidden) return;
  el.glossaryPage.hidden = true;
  el.btnGlossaryMenu.focus();
}

el.btnGlossaryMenu.addEventListener('click', () => glossaryOpen(true));
el.btnGlossaryBack.addEventListener('click', glossaryClose);
window.addEventListener('popstate', glossaryHide);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !el.glossaryPage.hidden) glossaryClose();
});

// A shared #glosario link opens straight into the view, without pushing a
// history entry the visitor could not have come from.
if (location.hash === GLOSSARY_HASH) glossaryOpen(false);
