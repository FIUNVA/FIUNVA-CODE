// Configuración del canvas
const canvas = document.getElementById("pongCanvas");
const context = canvas.getContext("2d");

canvas.width = 800;
canvas.height = 400;

// Configuración de audio
let popSound, scoreSound, collisionSound;
let audioEnabled = false;

try {
    popSound = new Audio();
    popSound.src = 'Pop.ogg';
    popSound.addEventListener('error', () => {
        // Fallback a formato WAV si OGG no está disponible
        popSound.src = 'pop.wav';
    });
    popSound.preload = 'auto';
    popSound.volume = 0.5;
    
    scoreSound = new Audio();
    scoreSound.src = 'Score.ogg';
    scoreSound.addEventListener('error', () => {
        // Fallback a formato WAV si OGG no está disponible
        scoreSound.src = 'score.wav';
    });
    scoreSound.preload = 'auto';
    scoreSound.volume = 0.6;
    
    collisionSound = new Audio();
    collisionSound.src = 'Colision.ogg';
    collisionSound.preload = 'auto';
    collisionSound.volume = 0.4;
} catch (error) {
    console.warn('No se pudo cargar el audio:', error);
    popSound = null;
    scoreSound = null;
    collisionSound = null;
}

// Configuración del juego
const paddleWidth = 12;
const paddleHeight = 100;
const ballSize = 8;
const paddleSpeed = 8;

// Estado del juego
let gameState = 'paused'; // 'playing', 'paused', 'gameOver'
let player1Score = 0;
let player2Score = 0;
let player1Lives = 3;
let player2Lives = 3;

// Colores dinámicos
const colors = [
    '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', 
    '#feca57', '#ff9ff3', '#54a0ff', '#5f27cd',
    '#00d2d3', '#ff9f43', '#10ac84', '#ee5a6f'
];
let currentColorIndex = 0;

// Objetos del juego
let leftPaddle = {
    x: 20,
    y: canvas.height / 2 - paddleHeight / 2,
    width: paddleWidth,
    height: paddleHeight,
    dy: 0,
    color: '#00ff88'
};

let rightPaddle = {
    x: canvas.width - paddleWidth - 20,
    y: canvas.height / 2 - paddleHeight / 2,
    width: paddleWidth,
    height: paddleHeight,
    dy: 0,
    color: '#00ff88'
};

let ball = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    size: ballSize,
    dx: 5,
    dy: 3,
    color: '#ffffff',
    trail: []
};

// Partículas para efectos
let particles = [];
let explosions = [];

// Funciones de utilidad
function getRandomColor() {
    return colors[Math.floor(Math.random() * colors.length)];
}

function addRandomness(speed) {
    // Agregar variabilidad al rebote (-20% a +20%)
    const randomFactor = 0.8 + Math.random() * 0.4;
    return speed * randomFactor;
}

function createParticles(x, y, color, count = 8) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x,
            y: y,
            dx: (Math.random() - 0.5) * 10,
            dy: (Math.random() - 0.5) * 10,
            color: color,
            life: 30,
            maxLife: 30,
            size: Math.random() * 4 + 2
        });
    }
}

function createExplosion(x, y, color) {
    explosions.push({
        x: x,
        y: y,
        color: color,
        size: 0,
        maxSize: 80,
        life: 20,
        maxLife: 20
    });
}

// Funciones de audio
function playPopSound() {
    if (popSound && audioEnabled) {
        try {
            popSound.currentTime = 0;
            const playPromise = popSound.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.warn('No se pudo reproducir el audio pop:', error);
                });
            }
        } catch (error) {
            console.warn('Error al reproducir el sonido pop:', error);
        }
    }
}

function playScoreSound() {
    if (scoreSound && audioEnabled) {
        try {
            scoreSound.currentTime = 0;
            const playPromise = scoreSound.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.warn('No se pudo reproducir el audio score:', error);
                });
            }
        } catch (error) {
            console.warn('Error al reproducir el sonido score:', error);
        }
    }
}

function playCollisionSound() {
    if (collisionSound && audioEnabled) {
        try {
            collisionSound.currentTime = 0;
            const playPromise = collisionSound.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.warn('No se pudo reproducir el audio de colisión:', error);
                });
            }
        } catch (error) {
            console.warn('Error al reproducir el sonido de colisión:', error);
        }
    }
}

function initializeAudio() {
    if (popSound && popSound.readyState === 0) {
        popSound.load();
    }
    if (scoreSound && scoreSound.readyState === 0) {
        scoreSound.load();
    }
    if (collisionSound && collisionSound.readyState === 0) {
        collisionSound.load();
    }
}

// Funciones de dibujo
function drawRect(x, y, w, h, color, glow = false) {
    context.fillStyle = color;
    if (glow) {
        context.shadowColor = color;
        context.shadowBlur = 15;
    }
    context.fillRect(x, y, w, h);
    if (glow) {
        context.shadowBlur = 0;
    }
}

function drawCircle(x, y, size, color, glow = false) {
    context.fillStyle = color;
    if (glow) {
        context.shadowColor = color;
        context.shadowBlur = 20;
    }
    context.beginPath();
    context.arc(x, y, size, 0, Math.PI * 2, false);
    context.fill();
    if (glow) {
        context.shadowBlur = 0;
    }
}

function drawBallTrail() {
    ball.trail.forEach((point, index) => {
        const alpha = index / ball.trail.length;
        const size = ball.size * alpha * 0.5;
        context.globalAlpha = alpha * 0.3;
        drawCircle(point.x, point.y, size, ball.color);
    });
    context.globalAlpha = 1;
}

function drawParticles() {
    particles.forEach((particle, index) => {
        const alpha = particle.life / particle.maxLife;
        context.globalAlpha = alpha;
        drawCircle(particle.x, particle.y, particle.size * alpha, particle.color);
        
        particle.x += particle.dx;
        particle.y += particle.dy;
        particle.dx *= 0.98; // Fricción
        particle.dy *= 0.98;
        particle.life--;
        
        if (particle.life <= 0) {
            particles.splice(index, 1);
        }
    });
    context.globalAlpha = 1;
}

function drawExplosions() {
    explosions.forEach((explosion, index) => {
        const progress = 1 - (explosion.life / explosion.maxLife);
        explosion.size = explosion.maxSize * progress;
        
        const alpha = explosion.life / explosion.maxLife;
        context.globalAlpha = alpha;
        
        // Círculo exterior
        context.strokeStyle = explosion.color;
        context.lineWidth = 3;
        context.beginPath();
        context.arc(explosion.x, explosion.y, explosion.size, 0, Math.PI * 2);
        context.stroke();
        
        // Círculo interior
        context.strokeStyle = '#ffffff';
        context.lineWidth = 1;
        context.beginPath();
        context.arc(explosion.x, explosion.y, explosion.size * 0.5, 0, Math.PI * 2);
        context.stroke();
        
        explosion.life--;
        
        if (explosion.life <= 0) {
            explosions.splice(index, 1);
        }
    });
    context.globalAlpha = 1;
}

function drawDottedLine() {
    context.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    context.lineWidth = 2;
    context.setLineDash([10, 10]);
    context.beginPath();
    context.moveTo(canvas.width / 2, 0);
    context.lineTo(canvas.width / 2, canvas.height);
    context.stroke();
    context.setLineDash([]);
}

// Movimiento de paletas
function movePaddle(paddle) {
    paddle.y += paddle.dy;
    if (paddle.y < 0) paddle.y = 0;
    if (paddle.y + paddle.height > canvas.height) paddle.y = canvas.height - paddle.height;
}

// Movimiento de la pelota
function moveBall() {
    if (gameState !== 'playing') return;
    
    // Actualizar trail
    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > 10) {
        ball.trail.shift();
    }
    
    ball.x += ball.dx;
    ball.y += ball.dy;

    // Colisión con techo y suelo
    if (ball.y + ball.size > canvas.height || ball.y - ball.size < 0) {
        ball.dy = addRandomness(-ball.dy);
        
        // Reproducir sonido de colisión con las orillas horizontales
        playCollisionSound();
        
        // Cambiar color y crear efecto
        currentColorIndex = (currentColorIndex + 1) % colors.length;
        ball.color = colors[currentColorIndex];
        createParticles(ball.x, ball.y, ball.color, 6);
        
        // Efecto de flash en el canvas
        canvas.classList.add('collision-effect');
        setTimeout(() => canvas.classList.remove('collision-effect'), 300);
    }

    // Colisión con paleta izquierda
    if (ball.x - ball.size <= leftPaddle.x + leftPaddle.width && 
        ball.y >= leftPaddle.y && 
        ball.y <= leftPaddle.y + leftPaddle.height &&
        ball.dx < 0) {
        
        // Reproducir sonido de rebote
        playPopSound();
        
        // Calcular posición relativa en la paleta
        const relativeIntersectY = (leftPaddle.y + leftPaddle.height / 2) - ball.y;
        const normalizedRelativeIntersectionY = relativeIntersectY / (leftPaddle.height / 2);
        const bounceAngle = normalizedRelativeIntersectionY * Math.PI / 4;
        
        ball.dx = addRandomness(Math.abs(ball.dx) * 1.05); // Incrementar velocidad
        ball.dy = addRandomness(-ball.dx * Math.tan(bounceAngle));
        
        // Cambiar colores
        currentColorIndex = (currentColorIndex + 1) % colors.length;
        ball.color = colors[currentColorIndex];
        leftPaddle.color = colors[currentColorIndex];
        
        createParticles(ball.x, ball.y, ball.color, 8);
        canvas.classList.add('collision-effect');
        setTimeout(() => canvas.classList.remove('collision-effect'), 300);
    }

    // Colisión con paleta derecha
    if (ball.x + ball.size >= rightPaddle.x && 
        ball.y >= rightPaddle.y && 
        ball.y <= rightPaddle.y + rightPaddle.height &&
        ball.dx > 0) {
        
        // Reproducir sonido de rebote
        playPopSound();
        
        const relativeIntersectY = (rightPaddle.y + rightPaddle.height / 2) - ball.y;
        const normalizedRelativeIntersectionY = relativeIntersectY / (rightPaddle.height / 2);
        const bounceAngle = normalizedRelativeIntersectionY * Math.PI / 4;
        
        ball.dx = addRandomness(-Math.abs(ball.dx) * 1.05);
        ball.dy = addRandomness(ball.dx * Math.tan(bounceAngle));
        
        // Cambiar colores
        currentColorIndex = (currentColorIndex + 1) % colors.length;
        ball.color = colors[currentColorIndex];
        rightPaddle.color = colors[currentColorIndex];
        
        createParticles(ball.x, ball.y, ball.color, 8);
        canvas.classList.add('collision-effect');
        setTimeout(() => canvas.classList.remove('collision-effect'), 300);
    }

    // Gol en la portería izquierda
    if (ball.x + ball.size < 0) {
        createExplosion(ball.x, ball.y, '#ff6b6b');
        createParticles(ball.x, ball.y, '#ff6b6b', 15);
        
        // Reproducir sonido de puntuación
        playScoreSound();
        
        player2Score++;
        player1Lives--;
        updateScoreboard();
        
        if (player1Lives <= 0) {
            gameState = 'gameOver';
            document.getElementById('gameStatus').textContent = 'JUGADOR 2 GANA! Presiona R para reiniciar';
        } else {
            resetBall();
        }
    }

    // Gol en la portería derecha
    if (ball.x - ball.size > canvas.width) {
        createExplosion(ball.x, ball.y, '#ff6b6b');
        createParticles(ball.x, ball.y, '#ff6b6b', 15);
        
        // Reproducir sonido de puntuación
        playScoreSound();
        
        player1Score++;
        player2Lives--;
        updateScoreboard();
        
        if (player2Lives <= 0) {
            gameState = 'gameOver';
            document.getElementById('gameStatus').textContent = 'JUGADOR 1 GANA! Presiona R para reiniciar';
        } else {
            resetBall();
        }
    }
}

function resetBall() {
    ball.x = canvas.width / 2;
    ball.y = canvas.height / 2;
    ball.dx = (Math.random() > 0.5 ? 1 : -1) * (4 + Math.random() * 2);
    ball.dy = (Math.random() - 0.5) * 6;
    ball.color = '#ffffff';
    ball.trail = [];
    
    gameState = 'paused';
    document.getElementById('gameStatus').textContent = 'Presiona ESPACIO para continuar';
}

function updateScoreboard() {
    document.getElementById('player1Score').textContent = player1Score;
    document.getElementById('player2Score').textContent = player2Score;
    document.getElementById('player1Lives').textContent = player1Lives;
    document.getElementById('player2Lives').textContent = player2Lives;
}

function resetGame() {
    // Solo permitir reinicio cuando haya un ganador
    if (gameState !== 'gameOver') return;
    
    player1Score = 0;
    player2Score = 0;
    player1Lives = 3;
    player2Lives = 3;
    
    leftPaddle.color = '#00ff88';
    rightPaddle.color = '#00ff88';
    
    particles = [];
    explosions = [];
    
    updateScoreboard();
    resetBall();
    
    gameState = 'paused';
    document.getElementById('gameStatus').textContent = 'Presiona ESPACIO para iniciar';
}

// Función de actualización
function update() {
    movePaddle(leftPaddle);
    movePaddle(rightPaddle);
    moveBall();
}

// Función de dibujo principal
function draw() {
    // Limpiar canvas
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    // Dibujar línea central
    drawDottedLine();
    
    // Dibujar trail de la pelota
    drawBallTrail();
    
    // Dibujar paletas con brillo
    drawRect(leftPaddle.x, leftPaddle.y, leftPaddle.width, leftPaddle.height, leftPaddle.color, true);
    drawRect(rightPaddle.x, rightPaddle.y, rightPaddle.width, rightPaddle.height, rightPaddle.color, true);
    
    // Dibujar pelota con brillo
    drawCircle(ball.x, ball.y, ball.size, ball.color, true);
    
    // Dibujar efectos
    drawParticles();
    drawExplosions();
}

// Bucle principal del juego
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// Controles del teclado
const keys = {};

document.addEventListener("keydown", (event) => {
    keys[event.key.toLowerCase()] = true;
    
    // Inicializar audio en la primera interacción
    if (!audioEnabled) {
        initializeAudio();
        audioEnabled = true;
    }
    
    switch (event.key.toLowerCase()) {
        case ' ':
            event.preventDefault();
            if (gameState === 'paused') {
                gameState = 'playing';
                document.getElementById('gameStatus').textContent = 'Jugando...';
            } else if (gameState === 'playing') {
                gameState = 'paused';
                document.getElementById('gameStatus').textContent = 'PAUSADO - Presiona ESPACIO para continuar';
            }
            break;
        case 'r':
            if (gameState === 'gameOver') {
                resetGame();
            } else {
                // Mostrar mensaje temporal si se trata de reiniciar antes de que termine
                const originalText = document.getElementById('gameStatus').textContent;
                document.getElementById('gameStatus').textContent = 'Debes esperar a que termine la partida para reiniciar';
                setTimeout(() => {
                    document.getElementById('gameStatus').textContent = originalText;
                }, 2000);
            }
            break;
    }
});

document.addEventListener("keyup", (event) => {
    keys[event.key.toLowerCase()] = false;
});

// Movimiento continuo de paletas
function handlePaddleMovement() {
    // Paleta izquierda
    if (keys['w']) leftPaddle.dy = -paddleSpeed;
    else if (keys['s']) leftPaddle.dy = paddleSpeed;
    else leftPaddle.dy = 0;
    
    // Paleta derecha
    if (keys['arrowup']) rightPaddle.dy = -paddleSpeed;
    else if (keys['arrowdown']) rightPaddle.dy = paddleSpeed;
    else rightPaddle.dy = 0;
}

// Actualizar movimiento de paletas en cada frame
setInterval(handlePaddleMovement, 16);

// Inicializar juego
resetGame();
gameLoop();
