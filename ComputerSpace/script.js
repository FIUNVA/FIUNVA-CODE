// Configuración del canvas y audio
const canvas = document.getElementById('gameCanvas');
const context = canvas.getContext('2d');
const flashOverlay = document.getElementById('flashOverlay');

canvas.width = 900;
canvas.height = 600;

// Configuración de audio mejorada
let shootSound, explosionSound;
try {
    shootSound = new Audio();
    shootSound.src = 'SDA.ogg';
    shootSound.addEventListener('error', () => {
        shootSound.src = 'SDA.wav';
    });
    shootSound.preload = 'auto';
    shootSound.volume = 0.3;

    // Agregar sonido de explosión
    explosionSound = new Audio();
    explosionSound.src = 'explosion.wav';
    explosionSound.preload = 'auto';
    explosionSound.volume = 0.4;
} catch (error) {
    console.warn('No se pudo cargar el audio:', error);
    shootSound = null;
    explosionSound = null;
}

// Variables del juego
let score = 0;
let lives = 3;
let level = 1;
let gameState = 'waiting'; // 'waiting', 'playing', 'paused', 'gameOver'
let audioEnabled = false;

// Colores para efectos dinámicos
const enemyColors = [
    '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', 
    '#feca57', '#ff9ff3', '#54a0ff', '#5f27cd',
    '#00d2d3', '#ff9f43', '#10ac84', '#ee5a6f',
    '#fd79a8', '#fdcb6e', '#6c5ce7', '#a29bfe'
];

// Efectos visuales
let particles = [];
let explosions = [];
let muzzleFlashes = [];

// Clase para partículas de efectos
class Particle {
    constructor(x, y, dx, dy, color, life = 60, size = 2) {
        this.x = x;
        this.y = y;
        this.dx = dx;
        this.dy = dy;
        this.color = color;
        this.life = life;
        this.maxLife = life;
        this.size = size;
    }

    update() {
        this.x += this.dx;
        this.y += this.dy;
        this.dx *= 0.98; // Fricción
        this.dy *= 0.98;
        this.life--;
        return this.life > 0;
    }

    draw() {
        const alpha = this.life / this.maxLife;
        context.globalAlpha = alpha;
        context.fillStyle = this.color;
        context.beginPath();
        context.arc(this.x, this.y, this.size * alpha, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
    }
}

// Clase para explosiones
class Explosion {
    constructor(x, y, color, maxSize = 40) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = 0;
        this.maxSize = maxSize;
        this.life = 30;
        this.maxLife = 30;
    }

    update() {
        const progress = 1 - (this.life / this.maxLife);
        this.size = this.maxSize * Math.sin(progress * Math.PI);
        this.life--;
        return this.life > 0;
    }

    draw() {
        const alpha = this.life / this.maxLife;
        context.globalAlpha = alpha;
        
        // Círculo exterior
        context.strokeStyle = this.color;
        context.lineWidth = 3;
        context.beginPath();
        context.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        context.stroke();
        
        // Círculo interior
        context.strokeStyle = '#ffffff';
        context.lineWidth = 1;
        context.beginPath();
        context.arc(this.x, this.y, this.size * 0.6, 0, Math.PI * 2);
        context.stroke();
        
        context.globalAlpha = 1;
    }
}

// Clase para destello de disparo
class MuzzleFlash {
    constructor(x, y, angle) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.life = 8;
        this.maxLife = 8;
        this.size = 20;
    }

    update() {
        this.life--;
        return this.life > 0;
    }

    draw() {
        const alpha = this.life / this.maxLife;
        context.globalAlpha = alpha;
        
        context.save();
        context.translate(this.x, this.y);
        context.rotate(this.angle);
        
        // Destello principal
        const gradient = context.createRadialGradient(0, 0, 0, 0, 0, this.size);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        gradient.addColorStop(0.5, 'rgba(255, 255, 0, 0.6)');
        gradient.addColorStop(1, 'rgba(255, 255, 0, 0)');
        
        context.fillStyle = gradient;
        context.fillRect(-this.size/2, -this.size/2, this.size, this.size);
        
        context.restore();
        context.globalAlpha = 1;
    }
}

// Clase mejorada de la nave del jugador
class Spaceship {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.angle = 0;
        this.dx = 0;
        this.dy = 0;
        this.thrust = 0.3;
        this.friction = 0.98;
        this.maxSpeed = 8;
        this.color = '#00ff00';
        this.bullets = [];
        this.size = 15;
        this.invulnerable = 0;
        this.lastShot = 0;
        this.shotCooldown = 150; // milisegundos
    }

    draw() {
        // Efecto de invulnerabilidad
        if (this.invulnerable > 0) {
            if (Math.floor(this.invulnerable / 5) % 2) {
                context.globalAlpha = 0.5;
            }
            this.invulnerable--;
        }

        context.save();
        context.translate(this.x, this.y);
        context.rotate(this.angle * Math.PI / 180);
        
        // Sombra/brillo
        context.shadowColor = this.color;
        context.shadowBlur = 10;
        
        // Cuerpo de la nave
        context.beginPath();
        context.moveTo(0, -this.size);
        context.lineTo(8, this.size);
        context.lineTo(0, this.size * 0.7);
        context.lineTo(-8, this.size);
        context.closePath();
        context.fillStyle = this.color;
        context.fill();
        
        // Detalles de la nave
        context.fillStyle = '#ffffff';
        context.beginPath();
        context.arc(0, 0, 3, 0, Math.PI * 2);
        context.fill();
        
        context.shadowBlur = 0;
        context.restore();
        context.globalAlpha = 1;
    }

    move(thrust) {
        const radians = this.angle * Math.PI / 180;
        
        if (thrust) {
            this.dx += Math.sin(radians) * this.thrust;
            this.dy -= Math.cos(radians) * this.thrust;
            
            // Partículas de propulsión (ajustado a 3 partículas)
            if (Math.random() < 0.5) { // Incrementar probabilidad
                for (let i = 0; i < 3; i++) {
                    const engineX = this.x - Math.sin(radians) * this.size;
                    const engineY = this.y + Math.cos(radians) * this.size;
                    
                    particles.push(new Particle(
                        engineX + (Math.random() - 0.5) * 3,
                        engineY + (Math.random() - 0.5) * 3,
                        -Math.sin(radians) * 2 + (Math.random() - 0.5),
                        Math.cos(radians) * 2 + (Math.random() - 0.5),
                        Math.random() > 0.5 ? '#ff6600' : '#ffaa00',
                        15,
                        Math.random() + 1
                    ));
                }
            }
        }
        
        // Aplicar fricción
        this.dx *= this.friction;
        this.dy *= this.friction;
        
        // Limitar velocidad máxima
        const speed = Math.sqrt(this.dx * this.dx + this.dy * this.dy);
        if (speed > this.maxSpeed) {
            this.dx = (this.dx / speed) * this.maxSpeed;
            this.dy = (this.dy / speed) * this.maxSpeed;
        }
        
        // Actualizar posición
        this.x += this.dx;
        this.y += this.dy;

        // Wraparound
        if (this.x < 0) this.x = canvas.width;
        if (this.x > canvas.width) this.x = 0;
        if (this.y < 0) this.y = canvas.height;
        if (this.y > canvas.height) this.y = 0;
    }

    rotate(direction) {
        this.angle += direction * 5;
    }

    shoot() {
        const now = Date.now();
        if (now - this.lastShot < this.shotCooldown) return;
        
        this.lastShot = now;
        
        const radians = this.angle * Math.PI / 180;
        const bulletX = this.x + Math.sin(radians) * this.size;
        const bulletY = this.y - Math.cos(radians) * this.size;
        
        this.bullets.push(new Bullet(bulletX, bulletY, this.angle, '#00ffff', true));
        
        // Crear destello de disparo
        muzzleFlashes.push(new MuzzleFlash(bulletX, bulletY, radians));
        
        // Reproducir sonido
        playShootSound();
    }

    takeDamage() {
        if (this.invulnerable > 0) return false;
        
        this.invulnerable = 120; // 2 segundos de invulnerabilidad
        lives--;
        updateHUD();
        
        // Reproducir sonido de explosión
        playExplosionSound();
        
        // Efecto visual de daño
        flashOverlay.className = 'flash-overlay player-hit';
        setTimeout(() => flashOverlay.className = 'flash-overlay', 500);
        
        // Crear explosión
        explosions.push(new Explosion(this.x, this.y, '#ff6b6b', 60));
        
        // Partículas de daño (ajustado a 8 partículas)
        for (let i = 0; i < 8; i++) {
            particles.push(new Particle(
                this.x,
                this.y,
                (Math.random() - 0.5) * 6,
                (Math.random() - 0.5) * 6,
                Math.random() > 0.5 ? '#ff6b6b' : '#ffffff',
                30,
                Math.random() * 2 + 1
            ));
        }
        
        return true;
    }
}

// Clase mejorada de balas
class Bullet {
    constructor(x, y, angle, color = '#ffff00', isPlayer = false) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.speed = isPlayer ? 12 : 8;
        this.dx = Math.sin(angle * Math.PI / 180) * this.speed;
        this.dy = -Math.cos(angle * Math.PI / 180) * this.speed;
        this.size = isPlayer ? 3 : 2;
        this.color = color;
        this.isPlayer = isPlayer;
        this.life = 180; // Tiempo de vida en frames
        this.trail = [];
    }

    draw() {
        // Dibujar estela
        this.trail.forEach((point, index) => {
            const alpha = index / this.trail.length * 0.5;
            context.globalAlpha = alpha;
            context.fillStyle = this.color;
            context.beginPath();
            context.arc(point.x, point.y, this.size * alpha, 0, Math.PI * 2);
            context.fill();
        });
        
        context.globalAlpha = 1;
        
        // Dibujar bala principal con brillo
        context.shadowColor = this.color;
        context.shadowBlur = 8;
        context.fillStyle = this.color;
        context.beginPath();
        context.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        context.fill();
        context.shadowBlur = 0;
    }

    move() {
        // Actualizar estela (optimizado)
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > 5) { // Reducido de 8 a 5
            this.trail.shift();
        }
        
        this.x += this.dx;
        this.y += this.dy;
        this.life--;
        
        return this.life > 0 && this.x >= 0 && this.x <= canvas.width && 
               this.y >= 0 && this.y <= canvas.height;
    }
}

// Clase mejorada de enemigos
class Enemy {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 25;
        this.height = 20;
        this.angle = Math.random() * 360;
        this.speed = 1 + Math.random() * 3;
        this.dx = Math.sin(this.angle * Math.PI / 180) * this.speed;
        this.dy = Math.cos(this.angle * Math.PI / 180) * this.speed;
        this.color = enemyColors[Math.floor(Math.random() * enemyColors.length)];
        this.bullets = [];
        this.lastShot = 0;
        this.shotCooldown = 1000 + Math.random() * 2000; // 1-3 segundos
        this.changeDirectionTimer = 0;
        this.health = 1;
        this.rotationSpeed = (Math.random() - 0.5) * 4;
        this.type = Math.floor(Math.random() * 3); // 3 tipos diferentes
    }

    draw() {
        context.save();
        context.translate(this.x, this.y);
        context.rotate(this.angle * Math.PI / 180);
        
        // Sombra/brillo
        context.shadowColor = this.color;
        context.shadowBlur = 8;
        
        switch (this.type) {
            case 0: // Nave triangular
                context.beginPath();
                context.moveTo(0, -this.height/2);
                context.lineTo(this.width/2, this.height/2);
                context.lineTo(-this.width/2, this.height/2);
                context.closePath();
                break;
            case 1: // Nave romboidal
                context.beginPath();
                context.moveTo(0, -this.height/2);
                context.lineTo(this.width/3, 0);
                context.lineTo(0, this.height/2);
                context.lineTo(-this.width/3, 0);
                context.closePath();
                break;
            case 2: // Nave hexagonal
                context.beginPath();
                for (let i = 0; i < 6; i++) {
                    const hexAngle = (i * Math.PI) / 3;
                    const hx = Math.cos(hexAngle) * this.width/3;
                    const hy = Math.sin(hexAngle) * this.height/3;
                    if (i === 0) context.moveTo(hx, hy);
                    else context.lineTo(hx, hy);
                }
                context.closePath();
                break;
        }
        
        context.fillStyle = this.color;
        context.fill();
        context.strokeStyle = '#ffffff';
        context.lineWidth = 1;
        context.stroke();
        
        context.shadowBlur = 0;
        context.restore();
    }

    move() {
        // Movimiento impredecible
        this.changeDirectionTimer++;
        if (this.changeDirectionTimer > 60 + Math.random() * 120) {
            this.changeDirectionTimer = 0;
            
            // Cambiar dirección hacia el jugador ocasionalmente
            if (Math.random() < 0.3) {
                const angleToPlayer = Math.atan2(spaceship.y - this.y, spaceship.x - this.x) * 180 / Math.PI + 90;
                this.angle = angleToPlayer + (Math.random() - 0.5) * 60;
            } else {
                this.angle += (Math.random() - 0.5) * 90;
            }
            
            this.dx = Math.sin(this.angle * Math.PI / 180) * this.speed;
            this.dy = Math.cos(this.angle * Math.PI / 180) * this.speed;
        }
        
        // Rotación visual
        this.angle += this.rotationSpeed;
        
        this.x += this.dx;
        this.y += this.dy;

        // Rebotar en bordes con variación
        if (this.x < 0 || this.x > canvas.width) {
            this.dx *= -1;
            this.x = Math.max(0, Math.min(canvas.width, this.x));
            this.angle += (Math.random() - 0.5) * 30;
        }
        if (this.y < 0 || this.y > canvas.height) {
            this.dy *= -1;
            this.y = Math.max(0, Math.min(canvas.height, this.y));
            this.angle += (Math.random() - 0.5) * 30;
        }

        // Disparar con predicción mejorada
        const now = Date.now();
        if (now - this.lastShot > this.shotCooldown) {
            this.shoot();
            this.lastShot = now;
            this.shotCooldown = 800 + Math.random() * 1500;
        }
    }

    shoot() {
        // Cambiar color al disparar
        this.color = enemyColors[Math.floor(Math.random() * enemyColors.length)];
        
        // Predicción del movimiento del jugador
        const dx = spaceship.x - this.x;
        const dy = spaceship.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const timeToTarget = distance / 8; // velocidad de la bala
        
        const predictedX = spaceship.x + spaceship.dx * timeToTarget;
        const predictedY = spaceship.y + spaceship.dy * timeToTarget;
        
        const angle = Math.atan2(predictedX - this.x, predictedY - this.y) * 180 / Math.PI;
        
        // Añadir algo de imprecisión
        const finalAngle = angle + (Math.random() - 0.5) * 20;
        
        this.bullets.push(new Bullet(
            this.x,
            this.y,
            finalAngle,
            this.color,
            false
        ));
        
        // Partículas de disparo (ajustado a 5 partículas)
        if (Math.random() < 0.6) { // Incrementar probabilidad
            for (let i = 0; i < 5; i++) {
                particles.push(new Particle(
                    this.x,
                    this.y,
                    (Math.random() - 0.5) * 2,
                    (Math.random() - 0.5) * 2,
                    this.color,
                    12,
                    Math.random() + 0.5
                ));
            }
        }
    }

    destroy() {
        // Reproducir sonido de explosión
        playExplosionSound();
        
        // Animación de destrucción
        explosions.push(new Explosion(this.x, this.y, this.color, 50));
        
        // Partículas de destrucción (mantenido en 12 partículas como solicitado)
        for (let i = 0; i < 12; i++) {
            particles.push(new Particle(
                this.x,
                this.y,
                (Math.random() - 0.5) * 8,
                (Math.random() - 0.5) * 8,
                Math.random() > 0.5 ? this.color : '#ffffff',
                40,
                Math.random() * 2 + 1
            ));
        }
        
        // Efecto de flash
        flashOverlay.className = 'flash-overlay enemy-hit';
        setTimeout(() => flashOverlay.className = 'flash-overlay', 300);
    }
}

// Instancias del juego
const spaceship = new Spaceship(canvas.width / 2, canvas.height / 2);
let enemies = [];

// Funciones de audio
function playShootSound() {
    if (shootSound && audioEnabled) {
        try {
            shootSound.currentTime = 0;
            const playPromise = shootSound.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.warn('No se pudo reproducir el audio:', error);
                });
            }
        } catch (error) {
            console.warn('Error al reproducir el sonido:', error);
        }
    }
}

function playExplosionSound() {
    if (explosionSound && audioEnabled) {
        try {
            explosionSound.currentTime = 0;
            const playPromise = explosionSound.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.warn('No se pudo reproducir el audio de explosión:', error);
                });
            }
        } catch (error) {
            console.warn('Error al reproducir el sonido de explosión:', error);
        }
    }
}

function initializeAudio() {
    if (shootSound && shootSound.readyState === 0) {
        shootSound.load();
    }
    if (explosionSound && explosionSound.readyState === 0) {
        explosionSound.load();
    }
}

// Generar enemigos con cantidad variable
function spawnEnemies() {
    const enemyCount = Math.min(2 + Math.floor(score / 50), 5); // 2-5 enemigos
    enemies = [];
    
    for (let i = 0; i < enemyCount; i++) {
        let x, y;
        // Asegurar que no aparezcan muy cerca del jugador
        do {
            x = Math.random() * canvas.width;
            y = Math.random() * canvas.height;
        } while (Math.sqrt((x - spaceship.x) ** 2 + (y - spaceship.y) ** 2) < 150);
        
        enemies.push(new Enemy(x, y));
    }
    
    updateHUD();
}

// Actualizar HUD
function updateHUD() {
    document.getElementById('scoreValue').textContent = score;
    document.getElementById('livesValue').textContent = '❤️'.repeat(Math.max(0, lives));
    document.getElementById('enemyCount').textContent = enemies.length;
    document.getElementById('levelValue').textContent = level;
}

// Función principal de actualización
function update() {
    if (gameState !== 'playing') return;
    
    // Actualizar spaceship
    spaceship.bullets = spaceship.bullets.filter(bullet => bullet.move());
    
    // Actualizar enemigos
    enemies.forEach(enemy => {
        enemy.move();
        enemy.bullets = enemy.bullets.filter(bullet => bullet.move());
    });
    
    // Colisiones bala-enemigo
    spaceship.bullets.forEach((bullet, bulletIndex) => {
        enemies.forEach((enemy, enemyIndex) => {
            const dx = bullet.x - enemy.x;
            const dy = bullet.y - enemy.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < enemy.width / 2 + bullet.size) {
                spaceship.bullets.splice(bulletIndex, 1);
                enemy.destroy(); // Ya incluye el sonido de explosión
                enemies.splice(enemyIndex, 1);
                score += 10;
                updateHUD();
            }
        });
    });
    
    // Colisiones bala enemiga-jugador
    enemies.forEach(enemy => {
        enemy.bullets.forEach((bullet, bulletIndex) => {
            const dx = bullet.x - spaceship.x;
            const dy = bullet.y - spaceship.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < spaceship.size + bullet.size) {
                enemy.bullets.splice(bulletIndex, 1);
                if (spaceship.takeDamage()) { // Ya incluye el sonido de explosión
                    if (lives <= 0) {
                        gameState = 'gameOver';
                        showGameOver();
                    }
                }
            }
        });
    });
    
    // Colisiones directas enemigo-jugador
    enemies.forEach(enemy => {
        const dx = enemy.x - spaceship.x;
        const dy = enemy.y - spaceship.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < spaceship.size + enemy.width / 2) {
            if (spaceship.takeDamage()) {
                if (lives <= 0) {
                    gameState = 'gameOver';
                    showGameOver();
                }
            }
        }
    });
    
    // Generar nuevos enemigos cuando no queden
    if (enemies.length === 0) {
        score += 50; // Bonus por limpiar la pantalla
        level++;
        spawnEnemies();
    }
    
    // Actualizar efectos (con límite de partículas)
    particles = particles.filter(particle => particle.update());
    if (particles.length > 100) { // Limitar partículas para mejor rendimiento
        particles = particles.slice(-80);
    }
    explosions = explosions.filter(explosion => explosion.update());
    muzzleFlashes = muzzleFlashes.filter(flash => flash.update());
}

// Función de dibujo
function draw() {
    // Limpiar canvas completamente para mejor rendimiento
    context.fillStyle = 'rgba(0, 0, 0, 1)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Dibujar estrellas de fondo
    drawStars();
    
    // Dibujar efectos
    particles.forEach(particle => particle.draw());
    explosions.forEach(explosion => explosion.draw());
    muzzleFlashes.forEach(flash => flash.draw());
    
    // Dibujar objetos del juego
    if (gameState === 'playing' || gameState === 'paused') {
        spaceship.draw();
        spaceship.bullets.forEach(bullet => bullet.draw());
        
        enemies.forEach(enemy => {
            enemy.draw();
            enemy.bullets.forEach(bullet => bullet.draw());
        });
    }
}

// Estrellas de fondo
const stars = [];
for (let i = 0; i < 100; i++) {
    stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2,
        opacity: Math.random() * 0.8 + 0.2
    });
}

function drawStars() {
    stars.forEach(star => {
        context.globalAlpha = star.opacity;
        context.fillStyle = '#ffffff';
        context.beginPath();
        context.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        context.fill();
    });
    context.globalAlpha = 1;
}

// Funciones de UI
function showGameOver() {
    document.getElementById('overlayTitle').textContent = 'GAME OVER';
    document.getElementById('overlayMessage').textContent = `Puntaje final: ${score}. Presiona R para reiniciar`;
    document.getElementById('gameOverlay').classList.add('show');
}

function hideOverlay() {
    document.getElementById('gameOverlay').classList.remove('show');
}

function resetGame() {
    score = 0;
    lives = 3;
    level = 1;
    spaceship.x = canvas.width / 2;
    spaceship.y = canvas.height / 2;
    spaceship.dx = 0;
    spaceship.dy = 0;
    spaceship.angle = 0;
    spaceship.bullets = [];
    spaceship.invulnerable = 0;
    particles = [];
    explosions = [];
    muzzleFlashes = [];
    spawnEnemies();
    updateHUD();
    gameState = 'playing';
    hideOverlay();
}

// Controles del juego
const keys = {};

document.addEventListener('keydown', (event) => {
    keys[event.key.toLowerCase()] = true;
    
    if (!audioEnabled) {
        initializeAudio();
        audioEnabled = true;
        document.getElementById('audioStatus').textContent = '🔊 Audio activado';
    }
    
    if (gameState === 'waiting') {
        gameState = 'playing';
        spawnEnemies();
        hideOverlay();
    } else if (gameState === 'gameOver' && event.key.toLowerCase() === 'r') {
        resetGame();
    }
});

document.addEventListener('keyup', (event) => {
    keys[event.key.toLowerCase()] = false;
});

// Manejo de movimiento continuo
function handleMovement() {
    if (gameState !== 'playing') return;
    
    if (keys['arrowleft']) spaceship.rotate(-1);
    if (keys['arrowright']) spaceship.rotate(1);
    if (keys['arrowup']) spaceship.move(true);
    if (keys['arrowdown']) spaceship.move(false);
    if (keys[' ']) spaceship.shoot();
}

// Bucle principal del juego
function gameLoop() {
    handleMovement();
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// Inicializar juego
updateHUD();
document.getElementById('gameOverlay').classList.add('show'); // Mostrar overlay inicial
gameLoop();