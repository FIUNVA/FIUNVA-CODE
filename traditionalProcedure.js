// ---------------------
// PROCEDIMIENTO TRADICIONAL MEJORADO
// ---------------------

// TRADICIONAL – SUMA
function traditionalAddition(num1, num2, base) {
  let carry = 0;
  let result = [];
  let carries = [];
  let steps = [];
  
  const maxLength = Math.max(num1.length, num2.length);
  const paddedNum1 = num1.padStart(maxLength, '0');
  const paddedNum2 = num2.padStart(maxLength, '0');
  
  for (let i = maxLength - 1; i >= 0; i--) {
    const d1 = digitToValue(paddedNum1[i]);
    const d2 = digitToValue(paddedNum2[i]);
    const sum = d1 + d2 + carry;
    const digitValue = sum % base;
    const newCarry = Math.floor(sum / base);
    
    carries.unshift(carry);
    result.unshift(valueToDigit(digitValue));
    
    steps.unshift({
      position: maxLength - i,
      column: i,
      d1: paddedNum1[i],
      d2: paddedNum2[i],
      carryIn: carry,
      sum: sum,
      digit: valueToDigit(digitValue),
      carryOut: newCarry
    });
    
    carry = newCarry;
  }
  
  if (carry > 0) {
    result.unshift(valueToDigit(carry));
    carries.unshift(carry);
  }
  
  return {
    result: result.join(''),
    carries: carries,
    steps: steps,
    num1: paddedNum1,
    num2: paddedNum2
  };
}

function showTraditionalAdditionProcedure(data, base) {
  const procedureDiv = document.getElementById('procedure');
  let html = `<div class="traditional-procedure addition-procedure">
    <h3>Suma Tradicional</h3>
    <div class="traditional-display">
      <div class="carry-row">
        ${data.carries.map(c => `<div class="digit">${c > 0 ? c : ''}</div>`).join('')}
      </div>
      <div class="number-row">
        ${[...data.num1].map(d => `<div class="digit">${d}</div>`).join('')}
      </div>
      <div class="operator-row">
        <span class="operator-symbol">+</span>
      </div>
      <div class="number-row">
        ${[...data.num2].map(d => `<div class="digit">${d}</div>`).join('')}
      </div>
      <div class="division-line"></div>
      <div class="number-row">
        ${[...data.result].map(d => `<div class="digit">${d}</div>`).join('')}
      </div>
    </div>
    <div class="traditional-steps">
      <h4>Pasos de la suma:</h4>
      <ol>
        ${data.steps.slice().reverse().map(step => 
          `<li>Columna ${data.num1.length - step.column}: ${step.d1} + ${step.d2} + acarreo(${step.carryIn}) = ${step.sum} → Se escribe <strong>${step.digit}</strong> y se pasa <strong>${step.carryOut}</strong>.</li>`
        ).join('')}
      </ol>
    </div>
  </div>`;
  
  procedureDiv.innerHTML = html;
}

// TRADICIONAL – RESTA (se asume que num1 ≥ num2)
function traditionalSubtraction(num1, num2, base) {
  let borrow = 0;
  let result = [];
  let borrows = [];
  let steps = [];
  
  const maxLength = Math.max(num1.length, num2.length);
  const paddedNum1 = num1.padStart(maxLength, '0');
  const paddedNum2 = num2.padStart(maxLength, '0');
  
  for (let i = maxLength - 1; i >= 0; i--) {
    let d1 = digitToValue(paddedNum1[i]) - borrow;
    const d2 = digitToValue(paddedNum2[i]);
    let currentBorrow = 0;
    if (d1 < d2) {
      d1 += base;
      currentBorrow = 1;
    }
    const diff = d1 - d2;
    
    borrows.unshift(borrow);
    result.unshift(valueToDigit(diff));
    
    steps.unshift({
      position: maxLength - i,
      column: i,
      d1: paddedNum1[i],
      d2: paddedNum2[i],
      borrowIn: borrow,
      diff: diff,
      borrowOut: currentBorrow
    });
    
    borrow = currentBorrow;
  }
  
  return {
    result: result.join('').replace(/^0+/, '') || '0',
    borrows: borrows,
    steps: steps,
    num1: paddedNum1,
    num2: paddedNum2
  };
}

function showTraditionalSubtractionProcedure(data, base) {
  const procedureDiv = document.getElementById('procedure');
  let html = `<div class="traditional-procedure subtraction-procedure">
    <h3>Resta Tradicional</h3>
    <div class="traditional-display">
      <div class="number-row">
        ${[...data.num1].map(d => `<div class="digit">${d}</div>`).join('')}
      </div>
      <div class="operator-row">
        <span class="operator-symbol">−</span>
      </div>
      <div class="number-row">
        ${[...data.num2].map(d => `<div class="digit">${d}</div>`).join('')}
      </div>
      <div class="division-line"></div>
      <div class="number-row">
        ${[...data.result].map(d => `<div class="digit">${d}</div>`).join('')}
      </div>
    </div>
    <div class="traditional-steps">
      <h4>Pasos de la resta:</h4>
      <ol>
        ${data.steps.slice().reverse().map(step => 
          `<li>Columna ${data.num1.length - step.column}: ${step.d1} − ${step.d2} (con préstamo ${step.borrowIn}) = ${step.diff} → Se genera préstamo: ${step.borrowOut}.</li>`
        ).join('')}
      </ol>
    </div>
  </div>`;
  
  procedureDiv.innerHTML = html;
}

// TRADICIONAL – MULTIPLICACIÓN (por productos parciales)
function traditionalMultiplication(num1, num2, base) {
  const maxLength = num2.length;
  let partialProducts = []; // Guardará cada línea de producto
  let steps = [];
  
  // Recorremos el multiplicador de derecha a izquierda
  for (let i = maxLength - 1; i >= 0; i--) {
    const multiplierDigit = digitToValue(num2[i]);
    let carry = 0;
    let partial = [];
    let stepDetails = [];
    for (let j = num1.length - 1; j >= 0; j--) {
      const multiplicandDigit = digitToValue(num1[j]);
      const product = multiplicandDigit * multiplierDigit + carry;
      const digit = product % base;
      carry = Math.floor(product / base);
      partial.unshift(valueToDigit(digit));
      stepDetails.unshift({
        multiplicandDigit: num1[j],
        multiplierDigit: num2[i],
        product: product,
        resultDigit: valueToDigit(digit),
        carry: carry
      });
    }
    if (carry > 0) {
      partial.unshift(valueToDigit(carry));
    }
    const partialStr = partial.join('') + '0'.repeat(maxLength - 1 - i);
    partialProducts.push(partialStr);
    steps.push({
      digit: num2[i],
      partial: partialStr,
      details: stepDetails
    });
  }
  
  // Sumar los productos parciales usando traditionalAddition
  let sum = '0';
  partialProducts.forEach(pp => {
    const sumData = traditionalAddition(sum, pp, base);
    sum = sumData.result;
  });
  
  return {
    result: sum,
    partialProducts: partialProducts,
    steps: steps,
    num1: num1,
    num2: num2
  };
}

function showTraditionalMultiplicationProcedure(data, base) {
  const procedureDiv = document.getElementById('procedure');
  let html = `<div class="traditional-procedure multiplication-procedure">
    <h3>Multiplicación Tradicional</h3>
    <div class="traditional-display">
      <div class="number-row">
        <span class="label">Multiplicando:</span>
        ${[...data.num1].map(d => `<div class="digit">${d}</div>`).join('')}
      </div>
      <div class="number-row">
        <span class="label">Multiplicador:</span>
        ${[...data.num2].map(d => `<div class="digit">${d}</div>`).join('')}
      </div>
      <div class="partial-products">
        <h4>Productos parciales:</h4>
        ${data.partialProducts.map((pp, idx) => 
          `<div class="number-row">
            <span class="partial-label">Parcial ${idx + 1}:</span>
            ${pp.split('').map(ch => `<div class="digit">${ch}</div>`).join('')}
          </div>`
        ).join('')}
      </div>
      <div class="division-line"></div>
      <div class="number-row">
        <span class="label">Resultado:</span>
        ${data.result.split('').map(ch => `<div class="digit">${ch}</div>`).join('')}
      </div>
    </div>
    <div class="traditional-steps">
      <h4>Detalles de la multiplicación:</h4>
      <ol>
        ${data.steps.map(step => 
          `<li>Multiplicar por ${step.digit}: ${step.details.map(d => `[${d.multiplicandDigit}×${step.digit}+${d.carry}]`).join(' ')} → Producto parcial: ${step.partial}</li>`
        ).join('')}
      </ol>
    </div>
  </div>`;
  
  procedureDiv.innerHTML = html;
}

// TRADICIONAL – DIVISIÓN (método de la "casita")
function traditionalDivision(dividendStr, divisorStr, base) {
  const dividendDec = parseInt(dividendStr, base);
  const divisorDec = parseInt(divisorStr, base);
  if (divisorDec === 0) throw new Error("División por cero");
  
  let quotient = '';
  let remainder = 0;
  let steps = [];
  let temp = '';
  
  for (let i = 0; i < dividendStr.length; i++) {
    temp += dividendStr[i];
    let tempDec = parseInt(temp, base);
    if (tempDec < divisorDec) {
      quotient += '0';
      steps.push({
        partialDividend: temp,
        quotientDigit: '0',
        subtraction: ''
      });
    } else {
      const qDigit = Math.floor(tempDec / divisorDec);
      const sub = qDigit * divisorDec;
      remainder = tempDec - sub;
      quotient += valueToDigit(qDigit);
      steps.push({
        partialDividend: temp,
        quotientDigit: valueToDigit(qDigit),
        subtraction: `${tempDec} - (${sub}) = ${remainder}`
      });
      temp = remainder.toString(base);
    }
  }
  return {
    quotient: quotient.replace(/^0+/, '') || '0',
    remainder: remainder,
    steps: steps,
    dividend: dividendStr,
    divisor: divisorStr
  };
}

function showTraditionalDivisionProcedure(data, base) {
  const procedureDiv = document.getElementById('procedure');
  let html = `<div class="traditional-procedure division-procedure">
    <h3>División Tradicional (Método de la casita)</h3>
    <div class="traditional-display">
      <div class="number-row">
        <span class="label">Dividendo:</span>
        ${data.dividend.split('').map(d => `<div class="digit">${d}</div>`).join('')}
      </div>
      <div class="number-row">
        <span class="label">Divisor:</span>
        ${data.divisor.split('').map(d => `<div class="digit">${d}</div>`).join('')}
      </div>
      <div class="division-result">
        <div><strong>Cociente:</strong> ${data.quotient}</div>
        <div><strong>Resto:</strong> ${data.remainder}</div>
      </div>
    </div>
    <div class="traditional-steps">
      <h4>Pasos de la división:</h4>
      <ol>
        ${data.steps.map((step, idx) => 
          `<li><strong>Paso ${idx + 1}:</strong> Se toma <em>${step.partialDividend}</em> → Se obtiene <strong>${step.quotientDigit}</strong> ${step.subtraction ? `(${step.subtraction})` : ''}</li>`
        ).join('')}
      </ol>
    </div>
  </div>`;
  
  procedureDiv.innerHTML = html;
}

// Función que muestra el procedimiento tradicional según la operación seleccionada
function toggleProcedureTraditional() {
  const procedureDiv = document.getElementById('procedure');
  const operation = document.getElementById('operation').value;
  const num1 = document.getElementById('num1').value.toUpperCase();
  const num2 = document.getElementById('num2').value.toUpperCase();
  
  if (procedureDiv.style.display === 'none' || !procedureDiv.style.display) {
    let data;
    switch (operation) {
      case '+':
        data = traditionalAddition(num1, num2, currentBase);
        showTraditionalAdditionProcedure(data, currentBase);
        break;
      case '-':
        data = traditionalSubtraction(num1, num2, currentBase);
        showTraditionalSubtractionProcedure(data, currentBase);
        break;
      case '*':
        data = traditionalMultiplication(num1, num2, currentBase);
        showTraditionalMultiplicationProcedure(data, currentBase);
        break;
      case '/':
        try {
          data = traditionalDivision(num1, num2, currentBase);
          showTraditionalDivisionProcedure(data, currentBase);
        } catch (e) {
          document.getElementById('error').textContent = e.message;
          return;
        }
        break;
      default:
        procedureDiv.innerHTML = '<div>No se implementa el procedimiento tradicional para esta operación.</div>';
    }
    procedureDiv.style.display = 'block';
  } else {
    procedureDiv.style.display = 'none';
  }
}
