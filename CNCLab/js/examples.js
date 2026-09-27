/* ============================================================
   PROGRAMAS DE EJEMPLO
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

const EXAMPLE_3 = `O0011;
G50 S2500 M04;
G96 S150 M08;
G00 T0101;
G00 X51.;
Z0.;

G01 X0. F0.1;
G00 Z1.;
X51.;
Z0.;

G72 W1.5 R0.5;
G72 P1 Q12 U0.25 W0.25;
N1 G00 Z-74.;
G01 X50. F0.1;
Z-68.;
G02 X42. Z-64. R4.;
G01 X40.;
X30. Z-39.;
X35. Z-21.;
Z-12.;
G02 X29. Z-9. R3.;
G01 X23.;
G03 X20. Z-7.5 R1.5;
G01 Z-2.;
G02 X16. Z0. R2.;
N12 G01 X0.;

G70 P1 Q12;

G00 Z10.;
G28 W0. M05;
G28 U0. M09;
T0100;
M30;
`;

function exampleProgramNumber(exampleNumber) {
  // Radix 10, not the default-looking 2: 3.toString(2) is "11", which turned the
  // third example into "O0011" and any fourth into "O00100".
  return 'O' + exampleNumber.toString(10).padStart(4, '0');
}

function withExampleProgramNumber(code, exampleNumber) {
  const header = exampleProgramNumber(exampleNumber) + ';';
  return /^\s*O\s*\d+\s*;/i.test(code)
    ? code.replace(/^\s*O\s*\d+\s*;/i, header)
    : header + '\n' + code;
}

const EXAMPLES = [EXAMPLE_1, EXAMPLE_2, EXAMPLE_3].map((code, index) => ({
  name: (/G72/.test(code) ? 'G72' : 'G71') + '-Ejemplo ' + (index + 1),
  code: withExampleProgramNumber(code, index + 1),
}));
// Taken from the list rather than from the raw EXAMPLE_n text so the program the app
// boots with is exactly what the matching entry in the EJEMPLOS menu loads — same
// text, same O number. Reaching for the template instead would boot O0011 while the
// "G72-Ejemplo 3" button still produced O0003.
const DEFAULT_PROGRAM = EXAMPLES[2].code;

