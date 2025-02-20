// Variables globales y manejo de bases
let currentBase = 10;
const baseButtons = document.querySelectorAll('.base-btn');
const baseInput = document.getElementById('baseInput');
let procedureSteps = []; // Para el procedimiento algorítmico

// Selección de base
baseButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    baseButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentBase = parseInt(btn.dataset.base);
    baseInput.value = currentBase;
    clearProcedure();
  });
});

baseInput.addEventListener('input', () => {
  const newBase = parseInt(baseInput.value);
  if(newBase >= 2 && newBase <= 36) {
    currentBase = newBase;
    baseButtons.forEach(b => b.classList.remove('active'));
    clearProcedure();
  }
});

function clearProcedure() {
  document.getElementById('error').textContent = '';
  document.getElementById('result').textContent = '';
  document.getElementById('showProcedureAlgorithmic').style.display = 'none';
  document.getElementById('showProcedureTraditional').style.display = 'none';
  const procDiv = document.getElementById('procedure');
  procDiv.style.display = 'none';
  procDiv.innerHTML = '';
  procedureSteps = [];
}

// Funciones de conversión comunes
function digitToValue(digit) {
  const upperDigit = digit.toUpperCase();
  if (/^\d$/.test(upperDigit)) return parseInt(upperDigit, 10);
  return upperDigit.charCodeAt(0) - 'A'.charCodeAt(0) + 10;
}

function valueToDigit(value) {
  if (value < 10) return value.toString();
  return String.fromCharCode('A'.charCodeAt(0) + value - 10);
}

function convertFractional(number, fromBase, toBase) {
  let precision = 8;
  let fractional = number.split('.')[1] || '';
  let decimal = 0;
  let conversionSteps = [];
  for(let i = 0; i < fractional.length; i++) {
    let digitValue = digitToValue(fractional[i]);
    let termValue = digitValue * Math.pow(fromBase, -(i+1));
    decimal += termValue;
    conversionSteps.push({
      digit: fractional[i].toUpperCase(),
      position: -(i+1),
      value: digitValue,
      calculation: `${digitValue} × ${fromBase}<sup>${-(i+1)}</sup> = ${termValue.toFixed(8)}`,
      subtotal: decimal.toFixed(8)
    });
  }
  let result = '';
  let toBaseSteps = [];
  for(let i = 0; i < precision; i++) {
    decimal *= toBase;
    let digit = Math.floor(decimal);
    let digitChar = valueToDigit(digit).toUpperCase();
    result += digitChar;
    toBaseSteps.push({
      multiplication: `${(decimal/toBase).toFixed(8)} × ${toBase} = ${decimal.toFixed(8)}`,
      integer: digit,
      digitChar: digitChar,
      remainder: (decimal - digit).toFixed(8)
    });
    decimal -= digit;
    if(decimal === 0) break;
  }
  procedureSteps.push({
    title: `Conversión de la parte fraccionaria de base ${fromBase} a decimal`,
    steps: conversionSteps,
    result: conversionSteps.length > 0 ? conversionSteps[conversionSteps.length - 1].subtotal : 0
  });
  procedureSteps.push({
    title: `Conversión de la parte fraccionaria decimal a base ${toBase}`,
    fractionalSteps: toBaseSteps,
    result: result
  });
  return result;
}

function toBase(number, fromBase, toBase) {
  if(number.includes('.')) {
    const [integerPart, fractionalPart] = number.split('.');
    const convertedInteger = parseInt(integerPart, fromBase).toString(toBase);
    const convertedFractional = convertFractional(number, fromBase, toBase);
    return `${convertedInteger}.${convertedFractional}`.toUpperCase();
  }
  const result = parseInt(number, fromBase).toString(toBase).toUpperCase();
  let intValue = parseInt(number, fromBase);
  procedureSteps.push({
    title: `Conversión de ${number} en base ${fromBase} a base ${toBase}`,
    original: number,
    decimal: intValue,
    result: result
  });
  return result;
}

function fromBase(number, base) {
  if(number.includes('.')) {
    const [integerPart, fractionalPart] = number.split('.');
    const decimalInteger = parseInt(integerPart, base);
    let conversionSteps = [];
    let intValue = 0;
    for(let i = 0; i < integerPart.length; i++) {
      let digitValue = digitToValue(integerPart[i]);
      let termValue = digitValue * Math.pow(base, integerPart.length - i - 1);
      intValue += termValue;
      conversionSteps.push({
        digit: integerPart[i].toUpperCase(),
        position: integerPart.length - i - 1,
        value: digitValue,
        calculation: `${digitValue} × ${base}<sup>${integerPart.length - i - 1}</sup> = ${termValue}`,
        subtotal: intValue
      });
    }
    procedureSteps.push({
      title: `Conversión de la parte entera ${integerPart} en base ${base} a decimal`,
      steps: conversionSteps,
      result: decimalInteger
    });
    const decimalFractional = [...fractionalPart].reduce((acc, digit, index) =>
      acc + parseInt(digit, base) * Math.pow(base, -(index + 1)), 0);
    return decimalInteger + decimalFractional;
  }
  let result = parseInt(number, base);
  let conversionSteps = [];
  let intValue = 0;
  for(let i = 0; i < number.length; i++) {
    let digitValue = digitToValue(number[i]);
    let termValue = digitValue * Math.pow(base, number.length - i - 1);
    intValue += termValue;
    conversionSteps.push({
      digit: number[i].toUpperCase(),
      position: number.length - i - 1,
      value: digitValue,
      calculation: `${digitValue} × ${base}<sup>${number.length - i - 1}</sup> = ${termValue}`,
      subtotal: intValue
    });
  }
  procedureSteps.push({
    title: `Conversión de ${number} en base ${base} a decimal`,
    steps: conversionSteps,
    result: result
  });
  return result;
}

function isValidNumber(num, base) {
  const validDigits = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.substring(0, base);
  const parts = num.split('.');
  return parts.every(part =>
    [...part.toUpperCase()].every(c => validDigits.includes(c))
  );
}

// Función principal de cálculo (algorítmico)
function calculate() {
  clearProcedure();
  const num1 = document.getElementById('num1').value.toUpperCase();
  const num2 = document.getElementById('num2').value.toUpperCase();
  const operation = document.getElementById('operation').value;
  const resultDiv = document.getElementById('result');
  const errorDiv = document.getElementById('error');

  if(!num1 || !num2) {
    errorDiv.textContent = 'Ingresa ambos números';
    return;
  }
  if(currentBase < 2 || currentBase > 36) {
    errorDiv.textContent = 'Base inválida (2-36)';
    return;
  }
  if(!isValidNumber(num1, currentBase) || !isValidNumber(num2, currentBase)) {
    errorDiv.textContent = `Dígitos inválidos para base ${currentBase}`;
    return;
  }
  try {
    // Conversión a decimal y realización de la operación
    const decimal1 = fromBase(num1, currentBase);
    const decimal2 = fromBase(num2, currentBase);
    let result, opSymbol;
    switch(operation) {
      case '+':
        result = decimal1 + decimal2;
        opSymbol = '+';
        break;
      case '-':
        result = decimal1 - decimal2;
        opSymbol = '-';
        break;
      case '*':
        result = decimal1 * decimal2;
        opSymbol = '×';
        break;
      case '/':
        if(decimal2 === 0) {
          errorDiv.textContent = 'No se puede dividir por cero';
          return;
        }
        result = decimal1 / decimal2;
        opSymbol = '÷';
        break;
    }
    procedureSteps.push({
      title: `Operación en decimal: ${decimal1} ${opSymbol} ${decimal2}`,
      num1: decimal1,
      num2: decimal2,
      operation: opSymbol,
      result: result
    });
    // Conversión del resultado a la base original
    const convertedResult = toBase(result.toString(10), 10, currentBase);
    resultDiv.innerHTML = `
      <div style="font-size: 1.8rem; color: var(--primary); margin: 10px 0;">
        ${convertedResult}
      </div>
      <div style="opacity: 0.8;">
        Decimal: ${result.toFixed(6).replace(/\.?0+$/, '')}
      </div>
    `;
    // Mostrar el botón del procedimiento algorítmico siempre
    document.getElementById('showProcedureAlgorithmic').style.display = 'block';
    // Mostrar el botón del procedimiento tradicional para las operaciones básicas
    if(['+', '-', '*', '/'].includes(operation)) {
      document.getElementById('showProcedureTraditional').style.display = 'block';
    }
  } catch (error) {
    errorDiv.textContent = 'Error en el cálculo: ' + error.message;
  }
}

// Procedimiento algorítmico: muestra los pasos guardados en procedureSteps
function toggleProcedureAlgorithmic() {
  const procedureDiv = document.getElementById('procedure');
  if(procedureDiv.style.display === 'none' || !procedureDiv.style.display) {
    let procedureHTML = '';
    procedureSteps.forEach(step => {
      let stepsHTML = '';
      if(step.steps) {
        step.steps.forEach(substep => {
          stepsHTML += `
            <div style="margin-left: 1rem; border-left: 2px solid var(--secondary); padding-left: 1rem; margin-bottom: 0.5rem;">
              <div>${substep.digit} en posición ${substep.position}: ${substep.calculation}</div>
              <div>Subtotal: ${substep.subtotal}</div>
            </div>
          `;
        });
      }
      if(step.fractionalSteps) {
        step.fractionalSteps.forEach(substep => {
          stepsHTML += `
            <div style="margin-left: 1rem; border-left: 2px solid var(--secondary); padding-left: 1rem; margin-bottom: 0.5rem;">
              <div>${substep.multiplication}</div>
              <div>Parte entera: ${substep.integer} → Dígito: ${substep.digitChar}</div>
              <div>Resto: ${substep.remainder}</div>
            </div>
          `;
        });
      }
      if(step.operation) {
        stepsHTML += `
          <div style="margin-left: 1rem; border-left: 2px solid var(--secondary); padding-left: 1rem; margin-bottom: 0.5rem;">
            <div>${step.num1} ${step.operation} ${step.num2} = ${step.result}</div>
          </div>
        `;
      }
      if(step.decimal !== undefined) {
        stepsHTML += `
          <div style="margin-left: 1rem; border-left: 2px solid var(--secondary); padding-left: 1rem; margin-bottom: 0.5rem;">
            <div>${step.original} en base ${currentBase} → ${step.decimal} en decimal → ${step.result} en base ${currentBase}</div>
          </div>
        `;
      }
      procedureHTML += `
        <div style="margin-bottom: 1.5rem;">
          <div style="font-weight: bold; color: var(--primary); margin-bottom: 0.5rem;">${step.title}</div>
          ${stepsHTML}
          <div style="font-weight: bold; margin-top: 0.5rem;">Resultado: ${step.result}</div>
        </div>
      `;
    });
    procedureDiv.innerHTML = procedureHTML;
    procedureDiv.style.display = 'block';
  } else {
    procedureDiv.style.display = 'none';
  }
}
