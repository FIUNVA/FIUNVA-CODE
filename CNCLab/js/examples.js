/* ============================================================
   PROGRAMA DE EJEMPLO POR DEFECTO
   ============================================================ */
const EXAMPLE_1 = `O0001;
G50 S2500 M03;
G96 S150 M08;
G00 T0101;
G00 X-55.;
Z0.;

G01 X0. F0.1;
G00 Z1.;
X-55.;
Z0.;

G71 U1.5 R0.5;
G71 P1 Q9 U0.25 W0.25;
N1 G01 X-4. F0.1;
G02 X-10. Z-3. R3.;
G01 Z-14.;
G03 X-14. Z-16. R2.;
G01 X-35.;
G02 X-40. Z-18.5 R2.5;
G01 Z-28.;
X-50. Z-48.;
N9 Z-56.;

G70 P1 Q9;

G00 X-55.;
Z-10.;
G28 W0. M05;
G28 U0. M09;
T0100;
M30;
`;

const EXAMPLE_2 = `O0010;
G50 S2500 M03 ;
G96 S150 M08 ;
G00 T0101 ;
G00 X-55. ;
Z0. ;

G01 X0. F0.1 ;
G00 Z1. ;
X-55. ;
Z0. ;

G71 U1.5 R0.5 ;
G71 P1 Q13 U0.25 W0.25 ;
N1 G01 X-0. F0.1 ;
G02 X-10. Z-5. R5. ;
G01 Z-8. ;
G03 X-18. Z-12. R4. ;
G01 X-23. ;
G02 X-30. Z-15.5 R3.5 ;
G01 Z-27. ;
G01 X-38. Z-40. ;
G01 Z-49. ;
G03 X-42. Z-51. R2. ;
G01 X-44. ;
G02 X-50. Z-54. R3. ;
N13 G01 Z-59. ;

G70 P1 Q13 ;

G00 X-55. ;
Z-10. ;
G28 W0. M05 ;
G28 U0. M09 ;
T0100 ;
M30 ;
`;

const EXAMPLES = [
  { name: 'G71-Ejemplo 1', code: EXAMPLE_1 },
  { name: 'G71-Ejemplo 2', code: EXAMPLE_2 },
];
const DEFAULT_PROGRAM = EXAMPLE_1;

