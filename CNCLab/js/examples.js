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

/* ============================================================
   EXAMPLE 4: M16×2.0 BOLT — G71 roughing, G70 finish, G75 groove & parting, G76 threading
   Blank: Ø30 (faced to the centre at Z0). Thread: M16×2, 30 mm long, run from Z+3 to Z-27.
   Undercut: radial plunge at Z-31 down to Ø12.5, as wide as the 3 mm insert.
   Shoulder: Ø25, 10 mm long (Z=-32..-42). Parting: G75 to X0 at Z-42.
   Tools: T01 turn, T02 groove/part (3 mm), T03 thread (60°).
   M04 (tool above the centreline) because every X here is positive, which is the pairing
   this simulator expects; with M03 it emitted its own "husillo y signo de X" warning.
   ============================================================ */
const EXAMPLE_4 = `O0100 (PERNO M16 CON UNDERCUT G71 G75 G76);

G50 S2500 M04; 
G96 S120 M08;
G00 T0101;
G00 X30. ;
Z0. ;

G01 X0. F0.1;
G00 Z1.;
X30.;
Z0. ;

G71 U2. R0.5;
G71 P10 Q20 U0.4 W0.1 F0.2;

N10 G01 X14. Z1.;
G01 X16. Z-1.;
G01 Z-32.;
G01 X25.;
N20 G01 Z-42.;

G70 P10 Q20 F0.08;
G00 X30. Z5.;
G28 U0. W0.;
T0100;

T0202;
G96 S80 M04;
G00 X18. Z-31.;

G75 R0.5;
G75 X12.5 P1500 F0.05;
G00 X30. Z5.;

T0303;
G97 S600 M04;
G00 X18. Z3.;

G76 P020060 Q100 R0.02;
G76 X13.55 Z-27. P1227 Q250 F2.0;
G00 X30. Z5.;
G28 U0. W0.;
T0300;

T0202;
G96 S60 M04;
G00 X27. Z-42.;

G75 R0.5;
G75 X0. P2000 F0.04;

G00 X30. Z10.;
M09;
M05;
G28 U0. W0.;
T0200;
M30;
`;

function exampleProgramNumber(exampleNumber) {
  // Radix 10, not the default-looking 2: 3.toString(2) is "11", which turned the
  // third example into "O0011" and any fourth into "O00100".
  return 'O' + exampleNumber.toString(10).padStart(4, '0');
}

function withExampleProgramNumber(code, exampleNumber) {
  const header = exampleProgramNumber(exampleNumber);
  // The whole program-number block is matched, comment included, and only the number is
  // rewritten: "O0100 (PERNO M16 ...);" becomes "O0004 (PERNO M16 ...);". Matching the
  // digits alone used to fail against a commented header, and the number was then PREPENDED,
  // leaving the example with "O0004;" on line 1 and "O0100 (...)" on line 2.
  const re = /^(\s*)O\s*\d+\s*(\([^)]*\))?\s*;/i;
  return re.test(code)
    ? code.replace(re, (_, sp, comment) => sp + header + (comment ? ' ' + comment : '') + ';')
    : header + ';\n' + code;
}

// Explicit titles. They used to be derived from the code ("/G72/ ? 'G72' : 'G71'"), which
// labelled the fourth example "G71-Ejemplo 4" and hid the fact that it is the G75 + G76 one.
const EXAMPLE_TITLES = ['G71-Ejemplo 1', 'G71-Ejemplo 2', 'G72-Ejemplo 3', 'G75/G76-Ejemplo 4'];

const EXAMPLES = [EXAMPLE_1, EXAMPLE_2, EXAMPLE_3, EXAMPLE_4].map((code, index) => ({
  name: EXAMPLE_TITLES[index] || ('Ejemplo ' + (index + 1)),
  code: withExampleProgramNumber(code, index + 1),
}));
// Taken from the list rather than from the raw EXAMPLE_n text so the program the app
// boots with is exactly what the matching entry in the EJEMPLOS menu loads — same
// text, same O number. Reaching for the template instead boots a program whose O number
// disagrees with the button that produces it (O0011 against O0003, back when this pointed
// at the third example).
// Default is the fourth: the M16 bolt with undercut, the one program that exercises every
// cycle the simulator implements at once — G71 roughing, G70 finishing, G75 grooving and
// parting, G76 threading. Booting with any simpler one hides half of them.
const DEFAULT_PROGRAM = EXAMPLES[3].code;

