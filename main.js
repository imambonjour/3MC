// Header Scroll Effect
const header = document.getElementById('main-header');

window.addEventListener('scroll', () => {
  if (window.scrollY > 50) {
    header.classList.add('scrolled');
  } else {
    header.classList.remove('scrolled');
  }
});

// Smooth scroll for navigation links
document.querySelectorAll('nav a').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    e.preventDefault();
    const targetId = this.getAttribute('href');
    const targetElement = document.querySelector(targetId);
    
    if (targetElement) {
      window.scrollTo({
        top: targetElement.offsetTop - 70,
        behavior: 'smooth'
      });
    }
  });
});

// Horizontal Slider Interaction
const slider = document.getElementById('film-slider');
let isDown = false;
let startX;
let scrollLeft;

slider.addEventListener('mousedown', (e) => {
  isDown = true;
  slider.classList.add('active');
  startX = e.pageX - slider.offsetLeft;
  scrollLeft = slider.scrollLeft;
});

slider.addEventListener('mouseleave', () => {
  isDown = false;
  slider.classList.remove('active');
});

slider.addEventListener('mouseup', () => {
  isDown = false;
  slider.classList.remove('active');
});

slider.addEventListener('mousemove', (e) => {
  if (!isDown) return;
  e.preventDefault();
  const x = e.pageX - slider.offsetLeft;
  const walk = (x - startX) * 2; // scroll-fast
  slider.scrollLeft = scrollLeft - walk;
});

// Intersection Observer for fade-in animations
const observerOptions = {
  threshold: 0.1
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, observerOptions);

document.querySelectorAll('section').forEach(section => {
  section.style.opacity = '0';
  section.style.transform = 'translateY(30px)';
  section.style.transition = 'opacity 0.8s ease-out, transform 0.8s ease-out';
  observer.observe(section);
});

// Mobile Menu Toggle
const mobileBtn = document.querySelector('.mobile-menu-btn');
const navMenu = document.querySelector('.nav-menu');

if (mobileBtn && navMenu) {
  mobileBtn.addEventListener('click', () => {
    navMenu.classList.toggle('active');
    const icon = mobileBtn.querySelector('i');
    if (navMenu.classList.contains('active')) {
      icon.classList.remove('fa-bars');
      icon.classList.add('fa-times');
    } else {
      icon.classList.remove('fa-times');
      icon.classList.add('fa-bars');
    }
  });

  // Close menu when a link is clicked
  document.querySelectorAll('.nav-menu a').forEach(link => {
    link.addEventListener('click', () => {
      navMenu.classList.remove('active');
      const icon = mobileBtn.querySelector('i');
      if (icon) {
        icon.classList.remove('fa-times');
        icon.classList.add('fa-bars');
      }
    });
  });
}

// --- TRACKING INTEGRATION ---
// Track Film Card Clicks
document.querySelectorAll('.film-card, .poster-item').forEach(card => {
  card.addEventListener('click', function() {
    if (typeof window.trackEvent === 'function') {
      const title = this.getAttribute('data-title') || this.querySelector('h3')?.innerText || 'Unknown Film';
      window.trackEvent('film_card_click', { film_title: title });
    }
  });
});

// Track WhatsApp Clicks
document.querySelectorAll('a[href*="wa.me"], a[href*="whatsapp.com"]').forEach(link => {
  link.addEventListener('click', function() {
    if (typeof window.trackEvent === 'function') {
      window.trackEvent('whatsapp_click', { destination: this.href });
    }
  });
});

// Track Questionnaire Submit (Override existing logic if needed)
const questionnaireForm = document.getElementById('questionnaire-form');
if (questionnaireForm) {
  questionnaireForm.addEventListener('submit', function(e) {
    // Delay slightly to ensure data is captured before potential redirect
    setTimeout(() => {
      if (typeof window.trackQuestionnaireSubmit === 'function') {
        window.trackQuestionnaireSubmit();
      }
    }, 100);
  });
}
