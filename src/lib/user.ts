export interface User {
  username: string;
  password?: string; // Optional for backward compatibility or if we want to allow guest mode later
  points: number; // Points system - disabled but kept for data structure
  lastLoginDate: string;
}

const USERS_KEY = 'geogebra_tutor_users';
const CURRENT_USER_KEY = 'geogebra_tutor_current_user';

export function getCurrentUser(): User | null {
  try {
    const stored = localStorage.getItem(CURRENT_USER_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function logoutUser(): void {
  localStorage.removeItem(CURRENT_USER_KEY);
}

export interface LoginResult {
  user: User | null;
  bonus: boolean;
  error?: string;
}

export function loginUser(username: string, password?: string): LoginResult {
  const users = getUsers();
  let user = users[username];
  const today = new Date().toISOString().split('T')[0];
  let bonus = false;

  if (!user) {
    // Register new user
    if (!password) {
      return { user: null, bonus: false, error: "注册需要设置密码" };
    }
    user = {
      username,
      password,
      points: 50, // Initial points - disabled
      lastLoginDate: today
    };
  } else {
    // Existing user login
    if (user.password && user.password !== password) {
       return { user: null, bonus: false, error: "密码错误" };
    }
    // If user has no password (legacy), we might want to set it, but for now let's just allow login or require update.
    // Assuming all new users will have passwords. 
    
    // Check daily login - disabled
    // if (user.lastLoginDate !== today) {
    //   user.points += 10;
    //   user.lastLoginDate = today;
    //   bonus = true;
    // }
  }

  saveUser(user);
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  return { user, bonus };
}

// Points deduction function - disabled
// export function deductPoints(amount: number): boolean {
//   const user = getCurrentUser();
//   if (!user) return false;

//   if (user.points >= amount) {
//     user.points -= amount;
//     saveUser(user);
//     localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
//     return true;
//   }
//   return false;
// }

function getUsers(): Record<string, User> {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveUser(user: User) {
  const users = getUsers();
  users[user.username] = user;
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}
