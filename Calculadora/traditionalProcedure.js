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
  
  // Crear la fila de acarreos con mejor visualización
  let carryRow = '<div class="carry-row">';
  carryRow += '<div class="carry-label">Acarreos:</div>';
  for (let i = 0; i < data.carries.length; i++) {
    const carry = data.carries[i];
    carryRow += `<div class="carry-digit ${carry > 0 ? 'has-carry' : ''}">${carry > 0 ? carry : '·'}</div>`;
  }
  carryRow += '</div>';
  
  let html = `<div class="traditional-procedure addition-procedure">
    <h3>Suma Tradicional (Base ${base})</h3>
    <div class="traditional-display">
      ${carryRow}
      <div class="number-row first-number">
        <div class="operation-label">+</div>
        ${[...data.num1].map(d => `<div class="digit main-digit">${d}</div>`).join('')}
      </div>
      <div class="number-row second-number">
        <div class="operation-space"></div>
        ${[...data.num2].map(d => `<div class="digit main-digit">${d}</div>`).join('')}
      </div>
      <div class="division-line-thick"></div>
      <div class="number-row result-row">
        <div class="operation-space"></div>
        ${[...data.result].map(d => `<div class="digit result-digit">${d}</div>`).join('')}
      </div>
    </div>
    <div class="step-by-step">
      <h4>Procedimiento paso a paso:</h4>
      <div class="steps-grid">
        ${data.steps.slice().reverse().map((step, index) => 
          `<div class="step-box">
            <div class="step-header">Columna ${data.num1.length - step.column}</div>
            <div class="step-calculation">
              <span class="addend">${step.d1}</span> + 
              <span class="addend">${step.d2}</span> + 
              <span class="carry-in">${step.carryIn}</span> = 
              <span class="total">${step.sum}</span>
            </div>
            <div class="step-result">
              Escribo: <span class="result-highlight">${step.digit}</span>, 
              Acarreo: <span class="carry-highlight">${step.carryOut}</span>
            </div>
          </div>`
        ).join('')}
      </div>
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
  
  // Crear visualización de préstamos en la parte superior
  let borrowIndicators = new Array(data.num1.length).fill(0);
  
  // Procesar préstamos para mostrar en la fila superior
  for (let i = 0; i < data.steps.length; i++) {
    const step = data.steps[i];
    if (step.borrowOut > 0) {
      // El préstamo se muestra en la posición donde se pide prestado
      if (step.column > 0) {
        borrowIndicators[step.column - 1] = 1;
      }
    }
  }
  
  // Crear la fila de préstamos
  let borrowRow = '<div class="borrow-row">';
  borrowRow += '<div class="borrow-label">Préstamos:</div>';
  for (let i = 0; i < borrowIndicators.length; i++) {
    const hasBorrow = borrowIndicators[i] > 0;
    borrowRow += `<div class="borrow-digit ${hasBorrow ? 'has-borrow' : ''}">${hasBorrow ? '1' : '·'}</div>`;
  }
  borrowRow += '</div>';
  
  let html = `<div class="traditional-procedure subtraction-procedure">
    <h3>Resta Tradicional (Base ${base})</h3>
    <div class="traditional-display">
      ${borrowRow}
      <div class="number-row first-number">
        <div class="operation-label">-</div>
        ${[...data.num1].map(d => `<div class="digit main-digit">${d}</div>`).join('')}
      </div>
      <div class="number-row second-number">
        <div class="operation-space"></div>
        ${[...data.num2].map(d => `<div class="digit main-digit">${d}</div>`).join('')}
      </div>
      <div class="division-line-thick"></div>
      <div class="number-row result-row">
        <div class="operation-space"></div>
        ${[...data.result].map(d => `<div class="digit result-digit">${d}</div>`).join('')}
      </div>
    </div>
    <div class="step-by-step">
      <h4>Procedimiento paso a paso:</h4>
      <div class="steps-grid">
        ${data.steps.slice().reverse().map((step, index) => {
          const adjustedD1 = digitToValue(step.d1) - step.borrowIn + (step.borrowOut > 0 ? base : 0);
          return `<div class="step-box">
            <div class="step-header">Columna ${data.num1.length - step.column}</div>
            <div class="step-calculation">
              ${step.borrowOut > 0 ? 
                `Necesito pedir prestado: <span class="original-digit">${step.d1}</span> → <span class="borrowed-result">${adjustedD1}</span><br>` :
                `Tengo: <span class="minuend">${adjustedD1}</span><br>`
              }
              <span class="calculation-line">${adjustedD1} - ${step.d2} = <span class="total">${step.diff}</span></span>
            </div>
            <div class="step-result">
              Resultado: <span class="result-highlight">${valueToDigit(step.diff)}</span>
              ${step.borrowOut > 0 ? '<br><span class="borrow-note">Se coloca 1 arriba en la siguiente columna</span>' : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
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
    <h3>Multiplicación Tradicional (Base ${base})</h3>
    <div class="traditional-display">
      <div class="number-row multiplicand-row">
        <div class="operation-label">×</div>
        ${[...data.num1].map(d => `<div class="digit main-digit">${d}</div>`).join('')}
      </div>
      <div class="number-row multiplier-row">
        <div class="operation-space"></div>
        ${[...data.num2].map(d => `<div class="digit main-digit">${d}</div>`).join('')}
      </div>
      <div class="division-line-thick"></div>
      
      <div class="partial-products-section">
        ${data.partialProducts.map((pp, idx) => {
          const multiplierDigit = data.num2[data.num2.length - 1 - idx];
          return `<div class="partial-product-row">
            <div class="partial-label">×${multiplierDigit}:</div>
            ${pp.split('').map(ch => `<div class="digit partial-digit">${ch}</div>`).join('')}
          </div>`;
        }).join('')}
      </div>
      
      ${data.partialProducts.length > 1 ? '<div class="division-line-thick sum-line"></div>' : ''}
      
      <div class="number-row result-row">
        <div class="result-label">Σ =</div>
        ${data.result.split('').map(ch => `<div class="digit result-digit">${ch}</div>`).join('')}
      </div>
    </div>
    
    <div class="step-by-step">
      <h4>Detalles de cada multiplicación:</h4>
      <div class="multiplication-details">
        ${data.steps.map((step, stepIndex) => 
          `<div class="mult-step-box">
            <div class="mult-step-header">
              Multiplicando ${data.num1} × ${step.digit}
            </div>
            <div class="mult-calculations">
              ${step.details.slice().reverse().map((detail, detailIndex) => {
                const position = step.details.length - detailIndex;
                return `<div class="mult-calc-row">
                  <span class="position-label">Pos ${position}:</span>
                  <span class="mult-operation">${detail.multiplicandDigit} × ${detail.multiplierDigit}</span>
                  ${detail.carry > 0 ? `<span class="carry-add"> + ${detail.carry}</span>` : ''}
                  <span class="equals"> = ${detail.product}</span>
                  <span class="result-breakdown"> → ${detail.resultDigit}</span>
                  ${Math.floor(detail.product / base) > 0 ? `<span class="carry-out">, acarreo ${Math.floor(detail.product / base)}</span>` : ''}
                </div>`;
              }).join('')}
            </div>
            <div class="partial-result">
              Producto parcial: <span class="partial-highlight">${step.partial}</span>
            </div>
          </div>`
        ).join('')}
      </div>
      
      ${data.partialProducts.length > 1 ? 
        `<div class="final-sum">
          <h4>Suma de productos parciales:</h4>
          <div class="sum-visualization">
            ${data.partialProducts.map(pp => 
              `<div class="sum-row">${pp}</div>`
            ).join('')}
            <div class="sum-line-final">───────────</div>
            <div class="sum-result">${data.result}</div>
          </div>
        </div>` : ''
      }
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
  let currentDividend = '';
  let position = 0;
  
  for (let i = 0; i < dividendStr.length; i++) {
    currentDividend += dividendStr[i];
    let currentDividendDec = parseInt(currentDividend, base);
    
    if (currentDividendDec < divisorDec) {
      quotient += '0';
      steps.push({
        position: i + 1,
        partialDividend: currentDividend,
        quotientDigit: '0',
        canDivide: false,
        explanation: `${currentDividend} < ${divisorStr}, escribo 0`
      });
    } else {
      const qDigit = Math.floor(currentDividendDec / divisorDec);
      const product = qDigit * divisorDec;
      const newRemainder = currentDividendDec - product;
      
      quotient += valueToDigit(qDigit);
      steps.push({
        position: i + 1,
        partialDividend: currentDividend,
        quotientDigit: valueToDigit(qDigit),
        canDivide: true,
        divisorValue: divisorDec,
        quotientValue: qDigit,
        product: product,
        productBase: product.toString(base),
        subtraction: `${currentDividendDec} - ${product} = ${newRemainder}`,
        remainder: newRemainder,
        remainderBase: newRemainder.toString(base),
        explanation: `${currentDividend} ÷ ${divisorStr} = ${valueToDigit(qDigit)}, resto ${newRemainder.toString(base)}`
      });
      
      currentDividend = newRemainder > 0 ? newRemainder.toString(base) : '';
      remainder = newRemainder;
    }
  }
  
  return {
    quotient: quotient.replace(/^0+/, '') || '0',
    remainder: remainder,
    remainderBase: remainder.toString(base),
    steps: steps,
    dividend: dividendStr,
    divisor: divisorStr
  };
}

function showTraditionalDivisionProcedure(data, base) {
  const procedureDiv = document.getElementById('procedure');
  
  let html = `<div class="traditional-procedure division-procedure">
    <h3>División Tradicional - Método de la Casita (Base ${base})</h3>
    
    <div class="division-casita">
      <!-- Estructura de la casita tradicional -->
      <div class="casita-structure">
        <!-- Cociente arriba -->
        <div class="quotient-line">
          ${data.quotient.split('').map(d => `<span class="quotient-digit">${d}</span>`).join('')}
        </div>
        
        <!-- Línea horizontal del cociente -->
        <div class="quotient-underline"></div>
        
        <!-- Divisor y dividendo -->
        <div class="divisor-dividend-row">
          <div class="divisor-box">
            ${data.divisor}
          </div>
          <div class="division-corner">⌐</div>
          <div class="dividend-box">
            ${data.dividend}
          </div>
        </div>
        
        <!-- Operaciones paso a paso debajo del dividendo -->
        <div class="division-operations">
          ${data.steps.filter(step => step.canDivide).map((step, index) => {
            return `
              <div class="operation-step">
                <!-- Multiplicación (divisor × dígito del cociente) -->
                <div class="multiplication-line">
                  <span class="operation-number">${step.productBase}</span>
                </div>
                <!-- Línea de resta -->
                <div class="subtraction-line"></div>
                <!-- Resultado de la resta -->
                <div class="subtraction-result">
                  <span class="remainder-number">${step.remainderBase}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        
        <!-- Resto final -->
        <div class="final-remainder">
          Resto: <span class="remainder-final-value">${data.remainderBase}</span>
        </div>
      </div>
    </div>
    
    <div class="step-by-step">
      <h4>Procedimiento paso a paso:</h4>
      <div class="division-steps">
        ${data.steps.map((step, index) => 
          `<div class="div-step-box ${step.canDivide ? 'can-divide' : 'cannot-divide'}">
            <div class="step-number">Paso ${index + 1}</div>
            <div class="step-content">
              ${step.canDivide ? 
                `<div class="division-calculation">
                  <div class="calc-explanation">
                    1. Tomo <strong>${step.partialDividend}</strong> del dividendo
                  </div>
                  <div class="calc-explanation">
                    2. <strong>${step.partialDividend}</strong> ÷ <strong>${data.divisor}</strong> = <span class="quotient-highlight">${step.quotientDigit}</span>
                  </div>
                  <div class="calc-explanation">
                    3. <strong>${step.quotientDigit}</strong> × <strong>${data.divisor}</strong> = <strong>${step.productBase}</strong>
                  </div>
                  <div class="calc-explanation">
                    4. <strong>${step.partialDividend}</strong> - <strong>${step.productBase}</strong> = <span class="remainder-highlight">${step.remainderBase}</span>
                  </div>
                </div>` :
                `<div class="no-division">
                  <span class="no-div-explanation">${step.explanation}</span>
                </div>`
              }
            </div>
          </div>`
        ).join('')}
      </div>
    </div>
    
    <div class="division-verification">
      <h4>Verificación:</h4>
      <div class="verification-formula">
        Dividendo = Cociente × Divisor + Resto
      </div>
      <div class="verification-calculation">
        ${data.dividend} = ${data.quotient} × ${data.divisor} + ${data.remainderBase}
      </div>
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
