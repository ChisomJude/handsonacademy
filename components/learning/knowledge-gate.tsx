'use client';
import {useMemo,useState} from 'react';
import {Check,CheckCircle2,LockKeyhole,RefreshCw,X} from 'lucide-react';
type Question={question:string;options:string[];answer:number};
const shell:Question[]=[
{question:'What does pwd show?',options:['The current working directory','The current user','The shell version','The files in a folder'],answer:0},
{question:'What does ~ usually represent?',options:['The filesystem root','Your home directory','The current file','A hidden command'],answer:1},
{question:'What does cd do?',options:['Copies data','Changes directory','Checks Docker','Creates a file'],answer:1},
{question:'What does mkdir create?',options:['A directory','A process','A package','A network port'],answer:0},
{question:'What does ls -la help you inspect?',options:['Running services','Files including hidden files','The Linux kernel','Python packages'],answer:1},
{question:'What does the > operator do in a shell?',options:['Reads a file','Redirects output to a file','Changes user','Starts a server'],answer:1},
{question:'Why use a virtual environment?',options:['To isolate project packages','To increase disk space','To replace the terminal','To expose a port'],answer:0},
{question:'What is an HTTP route?',options:['A filesystem folder','A path an application responds to','A Docker image','A shell variable'],answer:1},
{question:'What does curl commonly do?',options:['Sends requests to a URL','Creates directories','Stops processes','Changes permissions'],answer:0},
{question:'What is a process?',options:['A running program','A file extension','A directory shortcut','A database table'],answer:0},
{question:'What should you do first after an error?',options:['Ignore it','Read the message and check the previous step','Delete the project','Restart the computer'],answer:1},
{question:'What is an absolute path?',options:['A path starting from the filesystem root','A path with no folders','A hidden file','A command alias'],answer:0},
{question:'What does cat usually do?',options:['Displays file contents','Starts Nginx','Installs Python','Lists processes'],answer:0},
{question:'Why verify your working directory?',options:['To know where commands create or read files','To make commands faster','To change your password','To install Docker'],answer:0},
{question:'What does chmod change?',options:['File permissions','The current directory','A container image','The Python version'],answer:0},
{question:'What does a port identify?',options:['A network endpoint for a service','A text file','A shell prompt','A user account'],answer:0},
{question:'What does Flask provide?',options:['A Python web framework','A Linux shell','A database engine','A container runtime'],answer:0},
{question:'What does a health endpoint help confirm?',options:['That a service is responding','That a file is hidden','That Docker is installed','That a password is strong'],answer:0},
{question:'What is a checkpoint?',options:['A verification that a step worked','A backup server','A package manager','A login form'],answer:0},
{question:'Why should commands be run one logical step at a time?',options:['So you can understand and verify each result','So the terminal looks nicer','So files become hidden','So no output appears'],answer:0}
];
const docker:Question[]=[
{question:'What is a Docker image?',options:['A packaged template','A running process only','A host port','A log file'],answer:0},{question:'What is a container?',options:['A running instance of an image','A text editor','A DNS record','A shell variable'],answer:0},{question:'What does docker ps show?',options:['Running containers','All images only','Python routes','File permissions'],answer:0},{question:'What does docker ps -a add?',options:['Stopped containers','A new image','A port mapping','A volume'],answer:0},{question:'What does -d mean in docker run?',options:['Run detached in the background','Delete the image','Debug the kernel','Download logs'],answer:0},{question:'What does -p 8080:80 mean?',options:['Map host port 8080 to container port 80','Create 8080 containers','Use 80 images','Stop port 8080'],answer:0},{question:'Why open localhost:8080?',options:['To reach the service through the published host port','To inspect a Dockerfile','To remove a container','To enter a shell'],answer:0},{question:'What does docker logs show?',options:['Output from the container process','The host password','All network routes','The image source code'],answer:0},{question:'What does docker stop do?',options:['Asks a running container to stop','Deletes every image','Builds a Dockerfile','Opens a browser'],answer:0},{question:'What does docker rm do?',options:['Removes a container','Removes Docker itself','Deletes a host directory','Rewrites a port'],answer:0},{question:'Why name a container?',options:['To refer to it easily in later commands','To increase memory','To publish DNS','To create a user'],answer:0},{question:'What is Docker Desktop?',options:['A desktop distribution containing Docker tools','A Python package','A database GUI','A web browser'],answer:0},{question:'What does hello-world verify?',options:['That the Docker engine can run a container','That Nginx is configured','That Flask is installed','That MongoDB is reachable'],answer:0},{question:'What does docker inspect provide?',options:['Detailed container configuration','A list of Python routes','A terminal editor','A user profile'],answer:0},{question:'Why can a container stop immediately?',options:['Its main process finished or crashed','The image became a directory','The port was renamed','The host changed shells'],answer:0},{question:'What does a Dockerfile describe?',options:['How to build an image','How to approve users','How to query Supabase','How to edit a database'],answer:0},{question:'Why publish a port?',options:['To make a container service reachable from the host','To make a file hidden','To stop a process','To install an image'],answer:0},{question:'What should you check when a port is already in use?',options:['Choose another host port or stop the existing service','Delete Docker','Change the image name only','Run the same command repeatedly'],answer:0},{question:'What is the container filesystem?',options:['The writable layer inside a container','The host BIOS','A browser cache','A Google account'],answer:0},{question:'What is a checkpoint in a Docker lab?',options:['A test that confirms the container behaves as expected','A Docker license','A hidden image','A new user'],answer:0}
];
type Prepared = {question: string; options: string[]; answerIndex: number};

/** Fisher-Yates. sort(() => Math.random() - .5) is not a uniform shuffle. */
function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

/**
 * Options are shuffled per question as well as the questions themselves. Every entry
 * in the Docker bank stores its correct answer first, so a fixed order would let
 * anyone pass the checkpoint by always picking the top choice.
 */
function prepare(bank: Question[]): Prepared[] {
  return shuffle(bank).slice(0, 5).map(entry => {
    const correct = entry.options[entry.answer];
    const options = shuffle(entry.options);
    return {question: entry.question, options, answerIndex: options.indexOf(correct)};
  });
}

export function KnowledgeGate({track, missionId, onPassed}: {track: string; missionId: string; onPassed: (passed: boolean) => void}) {
  const bank = track === 'cloud-native-beginner'
    ? docker
    : missionId === 'linux-shell-basics'
      ? shell.filter(item => !item.question.includes('health endpoint') && !item.question.includes('Flask'))
      : shell;
  const [questions, setQuestions] = useState(() => prepare(bank));
  const [answers, setAnswers] = useState<(number | undefined)[]>([]);
  const [result, setResult] = useState<number | null>(null);

  const answeredAll = questions.every((_, index) => typeof answers[index] === 'number');
  const checked = result !== null;
  const passed = checked && result >= 4;

  function submit() {
    const score = questions.reduce((total, entry, index) => total + (answers[index] === entry.answerIndex ? 1 : 0), 0);
    setResult(score);
    onPassed(score >= 4);
  }
  function retry() {
    setQuestions(prepare(bank));
    setAnswers([]);
    setResult(null);
    onPassed(false);
  }

  return <div className="card" style={{padding: 22, marginTop: 20}}>
    <div style={{display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center'}}>
      <div><span className="eyebrow">Progress checkpoint</span><h3 style={{margin: '7px 0'}}>Knowledge check</h3></div>
      <span className="tag">Pass 80%</span>
    </div>
    <p className="lede" style={{fontSize: 13}}>Answer 4 of 5 correctly to unlock evidence submission and the next mission. Questions change when you retry.</p>

    <div style={{display: 'grid', gap: 18, marginTop: 18}}>
      {questions.map((entry, index) => {
        const chosen = answers[index];
        const right = chosen === entry.answerIndex;
        return <fieldset key={entry.question} style={{border: 0, padding: 0, margin: 0}}>
          <legend style={{fontWeight: 700, fontSize: 14, marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap'}}>
            <span>{index + 1}. {entry.question}</span>
            {checked && <span className={right ? 'mark-right' : 'mark-wrong'}>
              {right ? <><Check size={12} /> Correct</> : <><X size={12} /> Not quite</>}
            </span>}
          </legend>
          <div style={{display: 'grid', gap: 7}}>
            {entry.options.map((option, position) => {
              // After checking, every row says what it is: the right answer is always
              // marked, so a wrong pick teaches instead of just failing.
              const isAnswer = position === entry.answerIndex;
              const isChosen = chosen === position;
              const state = !checked ? '' : isAnswer ? 'option-right' : isChosen ? 'option-wrong' : '';
              return <label key={option} className={`option ${state}`}>
                <input type="radio" name={`q-${index}-${entry.question.slice(0, 12)}`} checked={isChosen} disabled={checked}
                  onChange={() => setAnswers(previous => {const next = [...previous]; next[index] = position; return next;})} />
                <span>{option}</span>
                {checked && isAnswer && <span className="option-note"><Check size={13} /> Correct answer</span>}
                {checked && isChosen && !isAnswer && <span className="option-note wrong"><X size={13} /> You picked this</span>}
              </label>;
            })}
          </div>
        </fieldset>;
      })}
    </div>

    <div aria-live="polite">
      {!checked
        ? <button className="btn btn-primary" style={{marginTop: 20}} disabled={!answeredAll} onClick={submit}>
            <LockKeyhole size={15} /> Check answers
          </button>
        : <div style={{marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 16}}>
            <p style={{fontWeight: 700, display: 'flex', gap: 8, alignItems: 'center', color: passed ? 'var(--brand)' : '#b9462b', margin: 0}}>
              {passed ? <CheckCircle2 size={18} /> : <X size={18} />}
              You got {result} of 5 right{passed ? '. Evidence submission is unlocked.' : '.'}
            </p>
            <p className="lede" style={{fontSize: 13, margin: '6px 0 12px'}}>
              {passed
                ? 'Green rows above show the correct answer for each question, including any you missed.'
                : 'Green rows above show the correct answer. Read the ones you missed, then try a fresh set of questions.'}
            </p>
            <button className="btn btn-secondary" onClick={retry}><RefreshCw size={15} /> Try another set</button>
          </div>}
    </div>

    <style>{`.option{display:flex;gap:9px;align-items:flex-start;font-size:13px;cursor:pointer;padding:8px 10px;border:1px solid transparent;border-radius:8px}.option:hover{background:#f6faf9}.option-right{background:#eaf7ef;border-color:#9fd3b4}.option-wrong{background:#fdeee9;border-color:#e8b6a6}.option-note{margin-left:auto;display:inline-flex;gap:4px;align-items:center;font:700 11px Manrope;color:#12706d;white-space:nowrap}.option-note.wrong{color:#b9462b}.mark-right,.mark-wrong{display:inline-flex;gap:4px;align-items:center;font:700 11px Manrope;padding:3px 9px;border-radius:99px}.mark-right{background:#eaf7ef;color:#12706d}.mark-wrong{background:#fdeee9;color:#b9462b}`}</style>
  </div>;
}
