# 🚀 HUB DE PROYECTOS WEB - FIUNVA CODE

## Introducción

Bienvenido al **HUB DE PROYECTOS WEB** de **FIUNVA CODE**, la submarca especializada en desarrollo de software y tecnología de **FIUNVA**. Este repositorio representa una colección integral de aplicaciones y juegos web interactivos desarrollados con tecnologías web modernas (HTML5, CSS3 y JavaScript).

FIUNVA CODE se enfoca en crear soluciones tecnológicas innovadoras, herramientas educativas y experiencias de entretenimiento digital que combinan funcionalidad práctica con diseño moderno. Cada proyecto en este hub ha sido cuidadosamente desarrollado para demostrar diferentes aspectos del desarrollo web front-end, desde aplicaciones utilitarias hasta recreaciones de juegos clásicos.

## 🏠 Archivo Principal (index.html)

### Descripción
El archivo `index.html` es la **página de inicio del hub** y actúa como el punto de entrada principal para todos los proyectos. Presenta una interfaz moderna y atractiva que muestra una galería de proyectos disponibles.

### Características Técnicas
- **Framework**: HTML5 puro con CSS3 y JavaScript vanilla
- **Diseño**: Responsive con CSS Grid y Flexbox
- **Tema Visual**: Diseño moderno con gradientes, sombras y efectos de hover
- **Interactividad**: Efectos de animación, ripple en botones y transiciones suaves
- **Branding**: Integración del logo FIUNVA CODE (FC1.png) en el footer

### Funcionalidades
- Grid responsive de proyectos que se adapta a diferentes pantallas
- Cards interactivas con efectos de hover y animaciones CSS
- Sistema de navegación hacia cada proyecto individual
- Efectos de ripple personalizados en botones
- Diseño totalmente responsive para dispositivos móviles

## 🧮 Proyecto: Calculadora Universal

### Ubicación: `/Calculadora/`

#### Descripción
Una calculadora avanzada diseñada para realizar operaciones aritméticas en múltiples bases numéricas (desde base 2 hasta base 36). Es una herramienta educativa y práctica que muestra procedimientos detallados paso a paso.

#### Archivos y Funciones

**`index.html`**
- Interfaz principal de la calculadora
- Diseño moderno con integración del logo FC2.png
- Layout responsivo con sidebar para la imagen
- Selector de bases numéricas (2, 8, 10, 16 + entrada personalizada)
- Controles para selección de operaciones (+, -, ×, ÷)

**`common.js`**
- Funciones de conversión entre bases numéricas
- Validación de entrada de datos
- Algoritmos de operaciones aritméticas
- Funciones de utilidad para manejo de números en diferentes bases
- Sistema de validación de caracteres válidos por base

**`traditionalProcedure.js`**
- Implementación de procedimientos matemáticos tradicionales
- Visualización paso a paso de operaciones
- Algoritmos de suma con acarreo
- Algoritmos de resta con préstamo
- Multiplicación con productos parciales
- División con método de "casita"

#### Características Especiales
- Soporte para números decimales en cualquier base
- Procedimientos algorítmicos y tradicionales
- Visualización detallada de cada paso
- Interfaz educativa con explicaciones
- Ejemplos integrados para diferentes bases

## 🚀 Proyecto: Computer Space

### Ubicación: `/ComputerSpace/`

#### Descripción
Recreación fiel del legendario juego de arcade "Computer Space" (1971), considerado el primer videojuego de arcade comercial. El juego presenta combate espacial con gráficos retro y mecánicas clásicas.

#### Archivos y Funciones

**`index.html`**
- Estructura HTML del juego
- Panel de estadísticas (puntuación, vidas, enemigos, nivel)
- Canvas para el área de juego
- Sidebar de controles con logo FC2.png integrado
- Overlay para estados del juego (inicio, pausa, game over)

**`script.js`**
- Motor del juego principal
- Sistema de física para naves y proyectiles
- IA de enemigos con patrones de movimiento
- Sistema de colisiones
- Manejo de puntuación y progresión de niveles
- Control de sonidos y efectos visuales

**`styles.css`**
- Diseño futurista con tema espacial
- Efectos de neón y gradientes animados
- Animaciones CSS para explosiones
- Diseño responsive para diferentes pantallas
- Estilos para el logo integrado de FIUNVA

#### Archivos de Audio
**`explosion.wav`** - Efecto sonoro para explosiones
**`SDA.ogg`** / **`SDA.wav`** - Música de fondo del juego (múltiples formatos para compatibilidad)

#### Mecánicas de Juego
- Movimiento de nave con rotación realista
- Disparos con limitación de munición
- Enemigos con diferentes comportamientos
- Sistema de vidas y puntuación
- Progresión de dificultad por niveles
- Efectos visuales de explosión y colisión

## 🏓 Proyecto: Pong Clásico

### Ubicación: `/Pong/`

#### Descripción
Implementación moderna del icónico juego Pong, manteniendo la esencia del juego original pero con gráficos y sonidos mejorados. Incluye modo para dos jugadores con controles independientes.

#### Archivos y Funciones

**`index.html`**
- Interfaz del juego con scoreboard
- Logo FC1.png integrado reemplazando el título original
- Canvas para el área de juego
- Panel de controles para ambos jugadores
- Información de vidas y puntuación en tiempo real

**`script.js`**
- Motor de juego Pong
- Física de pelota con rebotes realistas
- Control de paletas de jugadores
- Sistema de puntuación y vidas
- Detección de colisiones precisa
- Estados del juego (pausa, game over, jugando)

**`styles.css`**
- Diseño retro-futurista
- Efectos de neón para el canvas
- Animaciones de colisión
- Responsive design
- Integración visual del logo FIUNVA

#### Archivos de Audio y Documentación
**`AUDIO_README.md`** - Documentación específica de los archivos de sonido
**`Colision.ogg`** - Sonido de colisión con paletas
**`Pop.ogg`** - Sonido de rebote de pelota
**`Score.ogg`** - Sonido de anotación de puntos

#### Características del Juego
- Control dual para dos jugadores
- Física realista de pelota
- Sistema de vidas por jugador
- Efectos sonoros sincronizados
- Pausar/reanudar con tecla ESPACIO
- Reinicio completo del juego

## 🎨 Recursos Gráficos

### `/Imagenes/`

**`FC1.png`** - Logo principal de FIUNVA CODE
- Utilizado en el footer del hub principal
- Integrado como reemplazo del título en el juego Pong
- Formato PNG con transparencia
- Diseño optimizado para múltiples tamaños

**`FC2.png`** - Logo secundario de FIUNVA CODE
- Utilizado en la sidebar de la calculadora
- Integrado en el panel de controles de Computer Space
- Complementa la identidad visual de la marca
- Versión alternativa del branding principal

## 🛠️ Tecnologías Utilizadas

### Frontend
- **HTML5**: Estructura semántica y canvas para juegos
- **CSS3**: Diseño moderno con gradientes, animaciones y responsive design
- **JavaScript ES6+**: Lógica de aplicaciones, motores de juego y DOM manipulation

### Características Técnicas
- **Responsive Design**: Adaptable a dispositivos móviles y desktop
- **CSS Grid y Flexbox**: Layout moderno y flexible
- **Canvas API**: Renderizado de gráficos para juegos
- **Web Audio API**: Manejo de efectos sonoros
- **LocalStorage**: Persistencia de configuraciones (donde aplique)

### Compatibilidad
- Navegadores modernos (Chrome, Firefox, Safari, Edge)
- Dispositivos móviles y tablets
- Resoluciones desde 320px hasta 4K

## 🎯 Propósito Educativo

Cada proyecto en este hub sirve como:

1. **Demostración Técnica**: Ejemplos prácticos de desarrollo web
2. **Herramienta Educativa**: Especialmente la calculadora con procedimientos paso a paso
3. **Preservación Digital**: Recreación de juegos clásicos de la historia de los videojuegos
4. **Portfolio Profesional**: Muestra de habilidades en desarrollo frontend

## 🚀 Instalación y Uso

### Requisitos
- Navegador web moderno
- Servidor local (opcional, para desarrollo)

### Ejecución
1. Abrir `index.html` en un navegador web
2. Navegar a través de los diferentes proyectos
3. Cada proyecto es independiente y se ejecuta en su propio contexto

### Para Desarrollo
```bash
# Opcional: usar un servidor local
python -m http.server 8000
# o
npx live-server
```

## 📝 Notas de Desarrollo

### Filosofía de Código
- **Código limpio y comentado**: Facilita mantenimiento y aprendizaje
- **Modularidad**: Cada proyecto es independiente pero sigue patrones consistentes
- **Responsive first**: Diseño que funciona en cualquier dispositivo
- **Accesibilidad**: Consideraciones para usuarios con diferentes capacidades

### Estándares Utilizados
- Semántica HTML5
- CSS moderno sin frameworks externos
- JavaScript vanilla sin dependencias
- Optimización de recursos multimedia

## 🔮 Roadmap Futuro

- [ ] Más juegos clásicos (Tetris, Snake, Asteroids)
- [ ] Herramientas educativas adicionales
- [ ] Integración con APIs externas
- [ ] Sistema de puntuaciones online
- [ ] Modo oscuro/claro
- [ ] Internacionalización (i18n)

## 📞 Contacto

Intagram: @igfiunva

Facebook: Fiunva

Pagina web: https://fiunva.my.canva.site

Youtube: @FIUNVA

e-mail: fiunva.oficial@gmail.com


**FIUNVA CODE - Submarca de FIUNVA**
- Desarrollo de aplicaciones y juegos web
- Soluciones tecnológicas innovadoras
- Herramientas educativas digitales

---

*© 2025 FIUNVA CODE - Todos los derechos reservados*

